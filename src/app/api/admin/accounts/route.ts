import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ADMIN_MODULES, AdminPermissions } from '@/lib/adminModules';

type StaffRole = 'super_admin' | 'admin' | 'manager' | 'moderator' | 'agency_owner';
const MODULE_KEYS = new Set(ADMIN_MODULES.map((module) => module.key));

async function actorFrom(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Not authenticated.');
  const db = getSupabaseAdmin();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) throw new Error('Invalid or expired admin session.');
  const { data: account } = await db.from('admin_accounts').select('*').eq('profile_id', auth.user.id).maybeSingle();
  if (account?.is_active) return { db, id: auth.user.id, ...account };
  const { data: profile } = await db.from('profiles').select('role').eq('id', auth.user.id).single();
  if (profile?.role === 'super_admin') {
    return { db, id: auth.user.id, profile_id: auth.user.id, role: 'super_admin' as StaffRole, permissions: {}, is_active: true };
  }
  throw new Error('This dashboard account is disabled.');
}

function canCreate(actorRole: StaffRole, targetRole: StaffRole) {
  if (actorRole === 'super_admin') return targetRole !== 'super_admin';
  return actorRole === 'admin' && ['manager', 'moderator'].includes(targetRole);
}

function cleanPermissions(actor: { role: StaffRole; permissions: AdminPermissions }, input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const result: AdminPermissions = {};
  for (const [key, value] of Object.entries(source)) {
    if (!MODULE_KEYS.has(key) || !['view', 'manage'].includes(String(value))) continue;
    const level = String(value) as 'view' | 'manage';
    const actorLevel = actor.permissions?.[key];
    if (actor.role !== 'super_admin' && (!actorLevel || (level === 'manage' && actorLevel !== 'manage'))) {
      throw new Error(`You cannot grant ${level} access to ${key}.`);
    }
    result[key] = level;
  }
  return result;
}

function normalizeCredential(identifier: string) {
  const raw = identifier.trim();
  if (raw.includes('@')) return { email: raw.toLowerCase(), phone: null };
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) throw new Error('Enter a valid email address or phone number.');
  const phone = digits.startsWith('880') ? `+${digits}` : digits.startsWith('0') ? `+880${digits.slice(1)}` : `+880${digits}`;
  return { email: `${phone.slice(1)}@yolo.app`, phone };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await actorFrom(request);
    if (!['super_admin', 'admin'].includes(actor.role)) throw new Error('You cannot manage staff accounts.');
    let query = actor.db.from('admin_accounts')
      .select('profile_id,role,permissions,email,phone,is_active,created_by,created_at,updated_at,profiles!admin_accounts_profile_id_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (actor.role === 'admin') query = query.in('role', ['manager', 'moderator']);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ accounts: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed.' }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  let createdId: string | null = null;
  try {
    const actor = await actorFrom(request);
    const body = await request.json();
    const role = body.role as StaffRole;
    if (!canCreate(actor.role, role)) throw new Error('You cannot create this role.');
    if (String(body.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
    const credential = normalizeCredential(String(body.identifier || ''));
    const permissions = cleanPermissions(actor, body.permissions);
    const fullName = String(body.fullName || '').trim() || role.replace('_', ' ');

    const created = await actor.db.auth.admin.createUser({
      email: credential.email,
      password: String(body.password),
      email_confirm: true,
      user_metadata: { full_name: fullName, phone: credential.phone },
    });
    if (created.error || !created.data.user) throw created.error || new Error('Could not create account.');
    createdId = created.data.user.id;

    const { data: existing } = await actor.db.from('profiles').select('id').eq('id', createdId).maybeSingle();
    const profilePayload = { full_name: fullName, role, ...(credential.phone ? { phone_number: credential.phone } : {}) };
    const profileResult = existing
      ? await actor.db.from('profiles').update(profilePayload).eq('id', createdId)
      : await actor.db.from('profiles').insert({ id: createdId, ...profilePayload });
    if (profileResult.error) throw profileResult.error;

    const { error: accountError } = await actor.db.from('admin_accounts').insert({
      profile_id: createdId,
      role,
      permissions,
      email: String(body.identifier || '').includes('@') ? credential.email : null,
      phone: credential.phone,
      created_by: actor.id,
    });
    if (accountError) throw accountError;
    await actor.db.from('admin_audit_log').insert({
      admin_id: actor.id, action: 'create_admin_account', target_type: 'profile', target_id: createdId,
      payload: { role, permissions, email: credential.email, phone: credential.phone },
    });
    return NextResponse.json({ success: true, profileId: createdId });
  } catch (error) {
    if (createdId) {
      try { await getSupabaseAdmin().auth.admin.deleteUser(createdId); } catch {}
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create account.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await actorFrom(request);
    const body = await request.json();
    const targetId = String(body.profileId || '');
    const { data: target } = await actor.db.from('admin_accounts').select('*').eq('profile_id', targetId).single();
    if (!target) throw new Error('Staff account not found.');
    if (target.role === 'super_admin') throw new Error('Super admin accounts cannot be changed here.');
    if (actor.role !== 'super_admin' && !(actor.role === 'admin' && ['manager', 'moderator'].includes(target.role))) {
      throw new Error('You cannot change this account.');
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.permissions) update.permissions = cleanPermissions(actor, body.permissions);
    if (typeof body.isActive === 'boolean') update.is_active = body.isActive;
    if (body.password) {
      if (String(body.password).length < 8) throw new Error('Password must be at least 8 characters.');
      const passwordResult = await actor.db.auth.admin.updateUserById(targetId, { password: String(body.password) });
      if (passwordResult.error) throw passwordResult.error;
    }
    const { error } = await actor.db.from('admin_accounts').update(update).eq('profile_id', targetId);
    if (error) throw error;
    await actor.db.from('admin_audit_log').insert({
      admin_id: actor.id, action: 'update_admin_account', target_type: 'profile', target_id: targetId,
      payload: { permissions: update.permissions, is_active: update.is_active, password_changed: Boolean(body.password) },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update account.' }, { status: 400 });
  }
}
