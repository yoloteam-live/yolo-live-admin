import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type ProfileBrief = {
  id: string;
  full_name: string | null;
  display_id: number | string | null;
  role: string | null;
  agency_id: string | null;
};

type AgencyBrief = {
  id: string;
  name: string | null;
  code: string | null;
  owner_id: string | null;
};

type ResellerBrief = {
  id: string;
  name: string | null;
  user_id: string | null;
  status: string | null;
};

type TxRow = {
  id: string;
  user_id: string;
  related_user_id: string | null;
  type: string;
  currency: string;
  amount: number;
  balance_after: number | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const PRIVILEGED_ROLES = new Set(['agency_owner', 'admin', 'super_admin', 'manager', 'moderator', 'reseller']);
const GIFT_TYPES = new Set(['gift_sent', 'gift_received']);
const POWER_SEND_ENTITY_TYPES = new Set(['agency', 'reseller', 'topup_request', 'agency_stock_request']);
const POWER_SEND_TYPES = new Set(['topup', 'agency_payout', 'agency_transfer', 'reseller_payout']);

function parseNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function profileMatchesAgency(profile: ProfileBrief | undefined, agencyOwnerIds: Set<string>) {
  if (!profile) return false;
  return PRIVILEGED_ROLES.has(profile.role || '') || Boolean(profile.agency_id) || agencyOwnerIds.has(profile.id);
}

function isPowerProfile(profile: ProfileBrief | undefined, agencyOwnerIds: Set<string>, resellerUserIds: Set<string>) {
  if (!profile) return false;
  return PRIVILEGED_ROLES.has(profile.role || '') || agencyOwnerIds.has(profile.id) || resellerUserIds.has(profile.id);
}

function isNormalProfile(profile: ProfileBrief | undefined) {
  if (!profile) return false;
  return !PRIVILEGED_ROLES.has(profile.role || '');
}

function isGift(tx: TxRow) {
  return GIFT_TYPES.has(tx.type) || tx.type.includes('gift') || tx.related_entity_type === 'gift';
}

function classify(tx: TxRow, actor?: ProfileBrief, counterparty?: ProfileBrief, agency?: AgencyBrief) {
  if (tx.related_entity_type === 'agency' || tx.related_entity_type === 'agency_payout' || agency) return 'agency';
  if (actor?.role === 'super_admin' || counterparty?.role === 'super_admin') return 'super_admin';
  if (actor?.role === 'admin' || counterparty?.role === 'admin' || actor?.role === 'manager' || counterparty?.role === 'manager') return 'admin';
  if (actor?.role === 'agency_owner' || counterparty?.role === 'agency_owner') return 'agency';
  if (isGift(tx)) return 'gift';
  return 'non_gift';
}

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const params = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseNumber(params.get('limit')) || 100, 25), 500);
    const page = Math.max(parseNumber(params.get('page')) || 1, 1);
    const start = params.get('start');
    const end = params.get('end');
    const status = params.get('status') || 'all';
    const currency = params.get('currency') || 'all';
    const type = params.get('type') || 'all';
    const role = params.get('role') || 'all';
    const direction = params.get('direction') || 'all';
    const search = (params.get('search') || '').trim().toLowerCase();
    const minAmount = parseNumber(params.get('minAmount'));
    const maxAmount = parseNumber(params.get('maxAmount'));
    const includeGifts = params.get('includeGifts') === 'true';
    const mode = params.get('mode') || 'ledger';

    let query = db
      .from('transactions')
      .select('id,user_id,related_user_id,type,currency,amount,balance_after,related_entity_type,related_entity_id,status,notes,created_at')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);
    if (status !== 'all') query = query.eq('status', status);
    if (mode === 'power_sends') {
      query = query.eq('currency', 'diamond');
      if (type === 'all') query = query.in('type', Array.from(POWER_SEND_TYPES));
    } else if (currency !== 'all') {
      query = query.eq('currency', currency);
    }
    if (type !== 'all') query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as TxRow[];
    const profileIds = Array.from(new Set(rows.flatMap((row) => [row.user_id, row.related_user_id]).filter(Boolean) as string[]));
    const agencyIds = Array.from(new Set(rows
      .filter((row) => row.related_entity_type === 'agency' || row.related_entity_type === 'agency_payout')
      .map((row) => row.related_entity_id)
      .filter(Boolean) as string[]));

    const [profilesRes, agenciesRes, resellersRes] = await Promise.all([
      profileIds.length
        ? db.from('profiles').select('id,full_name,display_id,role,agency_id').in('id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      agencyIds.length
        ? db.from('agencies').select('id,name,code,owner_id').in('id', agencyIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? db.from('resellers').select('id,name,user_id,status').in('user_id', profileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (agenciesRes.error) throw agenciesRes.error;
    if (resellersRes.error) throw resellersRes.error;

    const profiles = new Map<string, ProfileBrief>((profilesRes.data || []).map((profile: ProfileBrief) => [profile.id, profile]));
    const agencies = new Map<string, AgencyBrief>((agenciesRes.data || []).map((agency: AgencyBrief) => [agency.id, agency]));
    const agencyOwnerIds = new Set((agenciesRes.data || []).map((agency: AgencyBrief) => agency.owner_id).filter(Boolean) as string[]);
    const resellerUserIds = new Set((resellersRes.data || []).map((reseller: ResellerBrief) => reseller.user_id).filter(Boolean) as string[]);

    const enriched = rows.map((tx) => {
      const actor = profiles.get(tx.user_id);
      const counterparty = tx.related_user_id ? profiles.get(tx.related_user_id) : undefined;
      const agency = tx.related_entity_id ? agencies.get(tx.related_entity_id) : undefined;
      const category = classify(tx, actor, counterparty, agency);
      const actorIsPower = isPowerProfile(actor, agencyOwnerIds, resellerUserIds);
      const counterpartyIsPower = isPowerProfile(counterparty, agencyOwnerIds, resellerUserIds);
      const actorIsNormal = isNormalProfile(actor);
      const counterpartyIsNormal = isNormalProfile(counterparty);
      const isPowerDirectSend =
        tx.currency === 'diamond' &&
        !isGift(tx) &&
        Boolean(tx.related_user_id) &&
        (POWER_SEND_TYPES.has(tx.type) || POWER_SEND_ENTITY_TYPES.has(tx.related_entity_type || '')) &&
        (
          (actorIsPower && counterpartyIsNormal && Number(tx.amount || 0) < 0) ||
          (counterpartyIsPower && actorIsNormal && Number(tx.amount || 0) > 0)
        );
      return {
        ...tx,
        amount: Number(tx.amount || 0),
        actor,
        counterparty,
        agency,
        category,
        isGift: isGift(tx),
        actorIsPower,
        counterpartyIsPower,
        isPowerDirectSend,
        hasAgencyOrAdminParty:
          profileMatchesAgency(actor, agencyOwnerIds) ||
          profileMatchesAgency(counterparty, agencyOwnerIds) ||
          Boolean(agency),
      };
    });

    const filtered = enriched.filter((tx) => {
      if (mode === 'power_sends' && !tx.isPowerDirectSend) return false;
      if (!includeGifts && tx.isGift) return false;
      if (direction === 'credit' && tx.amount <= 0) return false;
      if (direction === 'debit' && tx.amount >= 0) return false;
      if (minAmount !== null && Math.abs(tx.amount) < minAmount) return false;
      if (maxAmount !== null && Math.abs(tx.amount) > maxAmount) return false;
      if (role !== 'all' && tx.actor?.role !== role && tx.counterparty?.role !== role && tx.category !== role) return false;
      if (search) {
        const haystack = [
          tx.id,
          tx.type,
          tx.status,
          tx.currency,
          tx.notes,
          tx.actor?.full_name,
          tx.actor?.display_id,
          tx.actor?.role,
          tx.counterparty?.full_name,
          tx.counterparty?.display_id,
          tx.counterparty?.role,
          tx.agency?.name,
          tx.agency?.code,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (mode === 'power_sends') return true;
      return tx.hasAgencyOrAdminParty || !tx.isGift;
    });

    const typeCounts = filtered.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.type] = (acc[tx.type] || 0) + 1;
      return acc;
    }, {});
    const currencyTotals = filtered.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.currency] = (acc[tx.currency] || 0) + tx.amount;
      return acc;
    }, {});

    const kpis = {
      totalTransactions: filtered.length,
      completed: filtered.filter((tx) => tx.status === 'completed').length,
      pending: filtered.filter((tx) => tx.status === 'pending').length,
      credits: filtered.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0),
      debits: Math.abs(filtered.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0)),
      net: filtered.reduce((sum, tx) => sum + tx.amount, 0),
      agencyOrAdminTransactions: filtered.filter((tx) => tx.hasAgencyOrAdminParty).length,
      uniqueActors: new Set(filtered.map((tx) => tx.user_id)).size,
      typeCounts,
      currencyTotals,
    };

    const from = (page - 1) * limit;
    return NextResponse.json({
      rows: filtered.slice(from, from + limit),
      kpis,
      page,
      limit,
      total: filtered.length,
      capped: rows.length >= 5000,
      availableTypes: Array.from(new Set(enriched.map((tx) => tx.type))).sort(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Secret ledger load failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
