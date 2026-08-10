"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';

type PeriodKey = 'daily' | 'weekly' | 'monthly' | 'custom';

type ProfileBrief = {
  id: string;
  full_name: string | null;
  display_id: number | string | null;
  role: string | null;
  agency_id: string | null;
};

type Tx = {
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
  actor?: ProfileBrief;
  counterparty?: ProfileBrief;
  agency?: { id: string; name: string | null; code: string | null; owner_id: string | null };
  category: string;
  isGift: boolean;
  hasAgencyOrAdminParty: boolean;
};

type LedgerResponse = {
  rows: Tx[];
  kpis: {
    totalTransactions: number;
    completed: number;
    pending: number;
    credits: number;
    debits: number;
    net: number;
    agencyOrAdminTransactions: number;
    uniqueActors: number;
    typeCounts: Record<string, number>;
    currencyTotals: Record<string, number>;
  };
  page: number;
  limit: number;
  total: number;
  capped: boolean;
  availableTypes: string[];
};

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];

const STATUSES = ['all', 'completed', 'pending', 'failed', 'reversed'];
const CURRENCIES = ['all', 'diamond', 'bean', 'bdt'];
const ROLES = ['all', 'agency', 'admin', 'super_admin', 'agency_owner', 'manager', 'moderator', 'user', 'host'];
const DIRECTIONS = ['all', 'credit', 'debit'];

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function defaultRange(period: PeriodKey) {
  const now = new Date();
  const start = new Date(now);
  if (period === 'daily') {
    // Today.
  } else if (period === 'weekly') {
    start.setDate(now.getDate() - 6);
  } else {
    start.setDate(1);
  }
  return { start: isoDate(start), end: isoDate(now) };
}

function asStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : '';
}

function asEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : '';
}

function formatNumber(value: number) {
  return Math.round(Number(value || 0)).toLocaleString();
}

function label(value: string) {
  return value.replace(/_/g, ' ');
}

function actorLabel(profile?: ProfileBrief) {
  if (!profile) return 'Deleted / unknown';
  return profile.full_name || `User ${profile.display_id || profile.id.slice(0, 8)}`;
}

export default function SecretLedgerPage() {
  const pathname = usePathname();
  const directSendMode = pathname.includes('/power-send');
  const initial = useMemo(() => defaultRange('daily'), []);
  const [period, setPeriod] = useState<PeriodKey>('daily');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [type, setType] = useState('all');
  const [role, setRole] = useState('all');
  const [direction, setDirection] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [includeGifts, setIncludeGifts] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      start: asStart(startDate),
      end: asEnd(endDate),
      search,
      status,
      currency,
      type,
      role,
      direction,
      minAmount,
      maxAmount,
      includeGifts: String(includeGifts),
      mode: directSendMode ? 'power_sends' : 'ledger',
      page: String(page),
      limit: '100',
    });
    try {
      const response = await fetch(`/api/vltx-9q4r-aurora-ledger?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Ledger load failed');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ledger load failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currency, directSendMode, direction, endDate, includeGifts, maxAmount, minAmount, page, role, search, startDate, status, type]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function changePeriod(next: PeriodKey) {
    setPeriod(next);
    setPage(1);
    if (next !== 'custom') {
      const range = defaultRange(next);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  }

  function exportCsv() {
    if (!data?.rows.length) return;
    const headers = ['created_at', 'id', 'actor', 'actor_display_id', 'actor_role', 'counterparty', 'counterparty_display_id', 'counterparty_role', 'agency', 'type', 'currency', 'amount', 'status', 'notes'];
    const csvRows = data.rows.map((tx) => [
      tx.created_at,
      tx.id,
      actorLabel(tx.actor),
      tx.actor?.display_id || '',
      tx.actor?.role || '',
      actorLabel(tx.counterparty),
      tx.counterparty?.display_id || '',
      tx.counterparty?.role || '',
      tx.agency?.name || '',
      tx.type,
      tx.currency,
      tx.amount,
      tx.status,
      tx.notes || '',
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `secret-ledger-${startDate || 'all'}-${endDate || 'now'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(Math.ceil((data?.total || 0) / (data?.limit || 100)), 1);
  const topTypes = Object.entries(data?.kpis.typeCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <main className="min-h-screen bg-[#0E111E] px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
              <Shield size={15} /> {directSendMode ? 'Power Send Ledger' : 'Secret Ledger'}
            </div>
            <h1 className="text-2xl font-black sm:text-3xl">
              {directSendMode ? 'Power Accounts Sending Diamonds to Normal IDs' : 'Agency, Admin and Non-Gift Transactions'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              {directSendMode
                ? 'Only diamond movements where an agency, admin, reseller, or other power account directly sends to a normal user account.'
                : 'Direct access page for agency-to-personal, agency/admin account movement, and every transaction that is not a gift.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/vltx-9q4r-aurora-ledger" className={`flex h-10 items-center rounded-lg border px-3 text-sm font-bold ${!directSendMode ? 'border-pink-500 bg-pink-500 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'}`}>
              All Ledger
            </Link>
            <Link href="/vltx-9q4r-aurora-ledger/power-send" className={`flex h-10 items-center rounded-lg border px-3 text-sm font-bold ${directSendMode ? 'border-pink-500 bg-pink-500 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'}`}>
              Power Sends
            </Link>
            <button onClick={load} className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-bold text-gray-200 hover:bg-white/10">
              {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />} Refresh
            </button>
            <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-3 text-sm font-black text-[#06111F] hover:bg-cyan-300">
              <Download size={17} /> CSV
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Kpi title="Transactions" value={formatNumber(data?.kpis.totalTransactions || 0)} icon={<BarChart3 size={18} />} />
          <Kpi title="Completed" value={formatNumber(data?.kpis.completed || 0)} icon={<CheckCircle2 size={18} />} />
          <Kpi title="Pending" value={formatNumber(data?.kpis.pending || 0)} icon={<Clock size={18} />} />
          <Kpi title="Credits" value={formatNumber(data?.kpis.credits || 0)} icon={<ArrowDownLeft size={18} />} />
          <Kpi title="Debits" value={formatNumber(data?.kpis.debits || 0)} icon={<ArrowUpRight size={18} />} />
          <Kpi title="Actors" value={formatNumber(data?.kpis.uniqueActors || 0)} icon={<Users size={18} />} />
        </section>

        <section className="rounded-lg border border-white/10 bg-[#151225] p-4">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <button key={item.value} onClick={() => changePeriod(item.value)} className={`h-9 rounded-lg px-3 text-xs font-black uppercase tracking-wide ${period === item.value ? 'bg-pink-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Start"><input type="date" value={startDate} onChange={(e) => { setPeriod('custom'); setPage(1); setStartDate(e.target.value); }} /></Field>
            <Field label="End"><input type="date" value={endDate} onChange={(e) => { setPeriod('custom'); setPage(1); setEndDate(e.target.value); }} /></Field>
            <Field label="Status"><Select value={status} onChange={setStatus} options={STATUSES} /></Field>
            {!directSendMode && <Field label="Currency"><Select value={currency} onChange={setCurrency} options={CURRENCIES} /></Field>}
            {directSendMode && <Field label="Currency"><input value="diamond only" disabled /></Field>}
            <Field label="Type"><Select value={type} onChange={setType} options={['all', ...(data?.availableTypes || [])]} /></Field>
            <Field label="Party / Role"><Select value={role} onChange={setRole} options={ROLES} /></Field>
            <Field label="Direction"><Select value={direction} onChange={setDirection} options={DIRECTIONS} /></Field>
            <Field label="Min amount"><input inputMode="numeric" value={minAmount} onChange={(e) => { setPage(1); setMinAmount(e.target.value); }} placeholder="Any" /></Field>
            <Field label="Max amount"><input inputMode="numeric" value={maxAmount} onChange={(e) => { setPage(1); setMaxAmount(e.target.value); }} placeholder="Any" /></Field>
            <div className="xl:col-span-3">
              <Field label="Search">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={17} />
                  <input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Name, display ID, agency, note, transaction ID" className="pl-10" />
                </div>
              </Field>
            </div>
            <label className="flex h-[4.4rem] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-gray-300">
              <input type="checkbox" checked={includeGifts} onChange={(e) => { setPage(1); setIncludeGifts(e.target.checked); }} className="h-4 w-4 accent-pink-500" />
              {directSendMode ? 'Gift rows are excluded' : 'Include gift transactions'}
            </label>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#151225]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-black">
                <Filter size={16} className="text-cyan-300" />
                {(data?.total || 0).toLocaleString()} matching rows
                {data?.capped && <span className="text-xs font-bold text-amber-300">latest 5,000 scanned</span>}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                Page {page} of {totalPages}
                <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-white/10 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/10 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-widest text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Counterparty</th>
                    <th className="px-4 py-3">Agency</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-14 text-center text-gray-500"><Loader2 className="mr-2 inline animate-spin" size={18} /> Loading ledger...</td></tr>
                  ) : !data?.rows.length ? (
                    <tr><td colSpan={8} className="px-4 py-14 text-center text-gray-500">No transactions match these filters.</td></tr>
                  ) : data.rows.map((tx) => (
                    <tr key={tx.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(tx.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3"><Party profile={tx.actor} /></td>
                      <td className="px-4 py-3"><Party profile={tx.counterparty} muted /></td>
                      <td className="px-4 py-3 text-xs">
                        {tx.agency ? <><p className="font-bold text-cyan-200">{tx.agency.name || 'Agency'}</p><p className="font-mono text-gray-500">{tx.agency.code || tx.agency.id.slice(0, 8)}</p></> : <span className="text-gray-600">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">{label(tx.type)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">{tx.category}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className={`font-black ${tx.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}</p>
                        <p className="text-[10px] uppercase text-gray-500">{tx.currency}</p>
                      </td>
                      <td className="px-4 py-3"><Status status={tx.status} /></td>
                      <td className="max-w-[20rem] px-4 py-3 text-xs text-gray-400">{tx.notes || <span className="text-gray-600">-</span>}<p className="mt-1 font-mono text-[10px] text-gray-600">{tx.id}</p></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#151225] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black"><Wallet size={16} className="text-cyan-300" /> Currency Net</h2>
              {Object.entries(data?.kpis.currencyTotals || {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border-t border-white/5 py-3 text-sm">
                  <span className="uppercase text-gray-400">{key}</span>
                  <span className={value >= 0 ? 'font-black text-emerald-300' : 'font-black text-rose-300'}>{formatNumber(value)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-[#151225] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black"><CalendarDays size={16} className="text-cyan-300" /> Top Types</h2>
              {topTypes.length === 0 ? <p className="text-sm text-gray-500">No type data.</p> : topTypes.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border-t border-white/5 py-3 text-sm">
                  <span className="text-gray-300">{label(key)}</span>
                  <span className="font-black text-white">{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Kpi({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#151225] p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">{icon}</div>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function Field({ label: fieldLabel, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
      {fieldLabel}
      <div className="mt-1 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-white/10 [&_input]:bg-[#0E111E] [&_input]:px-3 [&_input]:text-sm [&_input]:font-semibold [&_input]:text-white [&_input]:outline-none [&_input]:focus:border-cyan-400 [&_select]:h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-white/10 [&_select]:bg-[#0E111E] [&_select]:px-3 [&_select]:text-sm [&_select]:font-semibold [&_select]:text-white [&_select]:outline-none [&_select]:focus:border-cyan-400">
        {children}
      </div>
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {Array.from(new Set(options)).map((option) => <option key={option} value={option}>{option === 'all' ? 'All' : label(option)}</option>)}
    </select>
  );
}

function Party({ profile, muted = false }: { profile?: ProfileBrief; muted?: boolean }) {
  if (!profile) return <span className="text-xs text-amber-300">Deleted / unknown</span>;
  return (
    <div>
      <p className={`font-bold ${muted ? 'text-gray-300' : 'text-white'}`}>{actorLabel(profile)}</p>
      <p className="font-mono text-[10px] text-gray-500">ID {profile.display_id || profile.id.slice(0, 8)} · {profile.role || 'user'}</p>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'text-emerald-300 bg-emerald-400/10',
    pending: 'text-amber-300 bg-amber-400/10',
    failed: 'text-rose-300 bg-rose-400/10',
    reversed: 'text-gray-300 bg-white/10',
  };
  const icon = status === 'completed' ? <CheckCircle2 size={13} /> : status === 'pending' ? <Clock size={13} /> : <XCircle size={13} />;
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black uppercase ${styles[status] || styles.reversed}`}>{icon}{status}</span>;
}
