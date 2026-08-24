"use client";

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, RefreshCw, Search, Vault } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAccess } from '@/lib/adminAccess';

type LedgerRow = {
  id: string;
  period_month: string;
  role_at_settlement: string;
  earned_beans: number;
  deposited_beans: number;
  balance_before: number;
  balance_after: number;
  settled_at: string;
  user?: { full_name?: string; display_id?: number; avatar_url?: string } | null;
};

export default function AnubisLedgerPage() {
  const { access } = useAdminAccess();
  const canRunSettlement = access?.role === 'super_admin';
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [holder, setHolder] = useState<{ display_id?: number; name?: string; total_bins_received?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');

  async function load() {
    setLoading(true);
    const [ledgerResult, holderResult] = await Promise.all([
      supabase
        .from('anubis_monthly_ledger')
        .select('*,user:profiles!anubis_monthly_ledger_user_id_fkey(full_name,display_id,avatar_url)')
        .order('period_month', { ascending: false })
        .order('deposited_beans', { ascending: false })
        .limit(1000),
      supabase.from('bins_holder_accounts').select('display_id,name,total_bins_received').eq('display_id', 990001).maybeSingle(),
    ]);
    if (ledgerResult.error) alert(ledgerResult.error.message);
    setRows((ledgerResult.data || []) as unknown as LedgerRow[]);
    setHolder(holderResult.data || null);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const months = useMemo(() => Array.from(new Set(rows.map((row) => row.period_month))), [rows]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (month && row.period_month !== month) return false;
      if (!needle) return true;
      return row.user?.full_name?.toLowerCase().includes(needle)
        || String(row.user?.display_id || '').includes(needle)
        || row.role_at_settlement.toLowerCase().includes(needle);
    });
  }, [rows, query, month]);

  const totals = useMemo(() => filtered.reduce((sum, row) => ({
    earned: sum.earned + Number(row.earned_beans || 0),
    deposited: sum.deposited + Number(row.deposited_beans || 0),
  }), { earned: 0, deposited: 0 }), [filtered]);

  async function runCatchUp() {
    if (!canRunSettlement) { alert('Only a super admin can run monthly settlement.'); return; }
    const suggested = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
    const value = window.prompt('Settle which month? Use YYYY-MM.', suggested);
    if (!value) return;
    if (!/^\d{4}-\d{2}$/.test(value)) { alert('Use YYYY-MM.'); return; }
    if (!window.confirm(`Run the idempotent Anubis ID settlement for ${value}? Existing user/month rows will be skipped.`)) return;
    setRunning(true);
    const { data, error } = await supabase.rpc('admin_run_anubis_monthly_settlement', { p_period_month: `${value}-01` });
    setRunning(false);
    if (error || !data?.success) { alert(data?.message || error?.message || 'Settlement failed'); return; }
    alert(`${Number(data.beans_deposited || 0).toLocaleString()} beans deposited from ${data.accounts_settled || 0} accounts.`);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white"><Vault className="text-cyan-400" /> Anubis ID Ledger</h1>
          <p className="text-gray-500">Monthly host and agency-owner bean earnings, actual deductions, and final balances.</p>
        </div>
        {canRunSettlement ? <button disabled={running} onClick={() => void runCatchUp()} className="flex items-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2 font-bold text-cyan-300 disabled:opacity-50">
          {running ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Run monthly catch-up
        </button> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Anubis ID', holder?.display_id || 990001],
          ['All-time received', Number(holder?.total_bins_received || 0).toLocaleString()],
          ['Filtered earned', totals.earned.toLocaleString()],
          ['Filtered deposited', totals.deposited.toLocaleString()],
        ].map(([label, value]) => <div key={label} className="glass-card p-4"><p className="text-xs uppercase text-gray-500">{label}</p><p className="mt-1 text-xl font-black text-white">{value}</p></div>)}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-500" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, user ID, role" className="w-72 rounded-xl border border-white/10 bg-[#1E1A34] py-2 pl-10 pr-4 text-white" /></div>
        <select value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-white/10 bg-[#1E1A34] px-4 text-white"><option value="">All months</option>{months.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <button onClick={() => void load()} className="rounded-xl bg-white/5 p-2 text-gray-300"><RefreshCw size={18} /></button>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/10 text-gray-500"><th className="p-4 text-left">Account</th><th className="text-left">Month / role</th><th className="text-right">Earned</th><th className="text-right">Deposited</th><th className="text-right">Before → after</th><th className="pr-4 text-right">Settled</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-16"><Loader2 className="mx-auto animate-spin text-cyan-400" /></td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="p-16 text-center text-gray-500">No Anubis settlement rows found.</td></tr> : filtered.map((row) => (
              <tr key={row.id} className="border-b border-white/5">
                <td className="p-4 font-bold text-white">{row.user?.full_name || 'User'}<div className="text-xs font-normal text-gray-500">ID {row.user?.display_id || '—'}</div></td>
                <td className="text-gray-300">{row.period_month}<div className="text-xs uppercase text-gray-500">{row.role_at_settlement.replace('_', ' ')}</div></td>
                <td className="text-right font-bold text-white">{Number(row.earned_beans).toLocaleString()}</td>
                <td className="text-right font-bold text-cyan-300">{Number(row.deposited_beans).toLocaleString()}</td>
                <td className="text-right text-gray-300">{Number(row.balance_before).toLocaleString()} → {Number(row.balance_after).toLocaleString()}</td>
                <td className="pr-4 text-right text-gray-500">{new Date(row.settled_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
