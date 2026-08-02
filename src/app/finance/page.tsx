"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarDays,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PeriodKey = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'total';

type AgencySummary = {
  agency_id: string;
  agency_name: string;
  agency_code: string;
  agency_status: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_display_id: number | string | null;
  total_hosts: number;
  total_beans_earned: number;
  total_transactions: number;
  last_earning_at: string | null;
};

type FinanceDetail = {
  agency: AgencySummary | null;
  hosts: any[];
  transactions: any[];
};

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'total', label: 'Total' },
];

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function defaultRange(period: PeriodKey) {
  const now = new Date();
  if (period === 'total') return { start: '', end: '' };

  const start = new Date(now);
  if (period === 'daily') {
    // Today
  } else if (period === 'weekly') {
    start.setDate(now.getDate() - 6);
  } else if (period === 'monthly') {
    start.setDate(1);
  } else if (period === 'yearly') {
    start.setMonth(0, 1);
  }
  return { start: isoDate(start), end: isoDate(now) };
}

function asStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

function asEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
}

export default function FinancePage() {
  const [period, setPeriod] = useState<PeriodKey>('monthly');
  const initial = useMemo(() => defaultRange('monthly'), []);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [rows, setRows] = useState<AgencySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AgencySummary | null>(null);
  const [detail, setDetail] = useState<FinanceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const rangeStart = asStart(startDate);
  const rangeEnd = asEnd(endDate);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_finance_agency_summary', {
      p_start: rangeStart,
      p_end: rangeEnd,
    });
    if (error) {
      alert('Finance load failed: ' + error.message);
      setRows([]);
    } else {
      setRows((data || []).map((row: any) => ({
        ...row,
        total_hosts: Number(row.total_hosts || 0),
        total_beans_earned: Number(row.total_beans_earned || 0),
        total_transactions: Number(row.total_transactions || 0),
      })));
    }
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  async function openAgency(row: AgencySummary) {
    setSelected(row);
    setDetailLoading(true);
    setDetail(null);
    const { data, error } = await supabase.rpc('admin_finance_agency_detail', {
      p_agency_id: row.agency_id,
      p_start: rangeStart,
      p_end: rangeEnd,
    });
    if (error) {
      alert('Agency detail failed: ' + error.message);
      setDetail({ agency: row, hosts: [], transactions: [] });
    } else {
      setDetail((data || { agency: row, hosts: [], transactions: [] }) as FinanceDetail);
    }
    setDetailLoading(false);
  }

  function changePeriod(value: PeriodKey) {
    setPeriod(value);
    const next = defaultRange(value);
    setStartDate(next.start);
    setEndDate(next.end);
  }

  const filteredRows = rows.filter((row) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [row.agency_name, row.agency_code, row.owner_name, row.owner_display_id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const totalBeans = rows.reduce((sum, row) => sum + Number(row.total_beans_earned || 0), 0);
  const totalHosts = rows.reduce((sum, row) => sum + Number(row.total_hosts || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Finance</h2>
          <p className="text-gray-500 mt-1">Agency-wise host bean earnings and transaction history.</p>
        </div>
        <button
          onClick={loadSummary}
          className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Beans Earned" value={totalBeans.toLocaleString()} icon={Wallet} />
        <StatCard label="Agencies" value={rows.length.toLocaleString()} icon={CalendarDays} />
        <StatCard label="Active Hosts" value={totalHosts.toLocaleString()} icon={Users} />
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center gap-3 flex-wrap">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              onClick={() => changePeriod(item.value)}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${
                period === item.value ? 'bg-pink-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <input
              type="date"
              value={startDate}
              disabled={period === 'total'}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2 text-sm text-white disabled:opacity-40"
            />
            <span className="text-gray-500 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              disabled={period === 'total'}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2 text-sm text-white disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-xl font-black text-white">Agency Earnings</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agency, code, owner..."
              className="bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white w-72 max-w-full focus:outline-none focus:border-pink-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[860px]">
            <thead>
              <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
                <th className="px-6 py-4 font-black">Agency</th>
                <th className="px-6 py-4 font-black">Owner</th>
                <th className="px-6 py-4 font-black text-center">Hosts</th>
                <th className="px-6 py-4 font-black text-right">Beans Earned</th>
                <th className="px-6 py-4 font-black text-center">Transactions</th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black text-right">Details</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Loading finance…</td></tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No agency earnings found for this range.</td></tr>
              )}
              {!loading && filteredRows.map((row) => (
                <tr
                  key={row.agency_id}
                  onClick={() => openAgency(row)}
                  className="border-b border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{row.agency_name || 'Unnamed agency'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">Code: {row.agency_code || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-white">{row.owner_name || 'No owner'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">ID: {row.owner_display_id || '—'}</p>
                  </td>
                  <td className="px-6 py-4 text-center font-black text-white">{row.total_hosts.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-400">{row.total_beans_earned.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center text-gray-300">{row.total_transactions.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-green-400/10 text-green-400">
                      {row.agency_status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right"><ChevronRight className="ml-auto text-gray-500" size={18} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-2xl bg-[#17132B] border-l border-[#251B45] shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#17132B]/95 backdrop-blur border-b border-white/5 p-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black text-white">{selected.agency_name}</h3>
                <p className="text-xs text-gray-500">Code {selected.agency_code} • {startDate || 'Beginning'} to {endDate || 'Now'}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="min-h-[50vh] flex items-center justify-center text-gray-500">
                <Loader2 className="animate-spin mr-2" size={20} /> Loading agency details…
              </div>
            ) : (
              <div className="p-5 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Beans Earned" value={(detail?.agency?.total_beans_earned ?? selected.total_beans_earned).toLocaleString()} icon={Wallet} compact />
                  <StatCard label="Hosts" value={(detail?.agency?.total_hosts ?? selected.total_hosts).toLocaleString()} icon={Users} compact />
                </div>

                <DrawerSection title="Hosts">
                  {(detail?.hosts || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No active hosts in this agency.</p>
                  ) : (
                    <div className="space-y-2">
                      {(detail?.hosts || []).map((host) => (
                        <div key={host.host_id} className="p-3 rounded-xl bg-white/5 flex justify-between gap-3">
                          <div>
                            <p className="font-bold text-white">{host.full_name || 'Unknown host'}</p>
                            <p className="text-[10px] text-gray-500 font-mono">ID: {host.display_id || '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-emerald-400">{Number(host.beans_earned || 0).toLocaleString()}</p>
                            <p className="text-[10px] text-gray-500">beans</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DrawerSection>

                <DrawerSection title="Transaction History">
                  {(detail?.transactions || []).length === 0 ? (
                    <p className="text-sm text-gray-500">No transactions in this range.</p>
                  ) : (
                    <div className="space-y-2">
                      {(detail?.transactions || []).map((tx) => (
                        <div key={tx.id} className="p-3 rounded-xl bg-white/5">
                          <div className="flex justify-between gap-3">
                            <p className="font-bold text-white">{tx.host_name || 'Host'}</p>
                            <p className="font-black text-emerald-400">{Number(tx.amount || 0).toLocaleString()} beans</p>
                          </div>
                          <p className="text-[11px] text-gray-400">{tx.type} • {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}</p>
                          {tx.notes ? <p className="text-[11px] text-gray-500 mt-1">{tx.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </DrawerSection>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, compact = false }: { label: string; value: string; icon: any; compact?: boolean }) {
  return (
    <div className={`glass-card ${compact ? 'p-4' : 'p-6'}`}>
      <div className="p-3 rounded-xl bg-emerald-400/10 text-emerald-400 w-fit"><Icon size={compact ? 18 : 24} /></div>
      <p className="text-gray-500 text-sm font-medium mt-4">{label}</p>
      <h3 className={`${compact ? 'text-xl' : 'text-2xl'} font-black text-white mt-1`}>{value}</h3>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-card p-5">
      <h4 className="text-lg font-black text-white mb-4">{title}</h4>
      {children}
    </section>
  );
}
