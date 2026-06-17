"use client";
import { useState, useEffect } from 'react';
import {
  Search, ShieldCheck, TrendingUp, Users, Loader2, CheckCircle2, XCircle, Ban, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Agency = {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  status: string;
  member_count: number;
  payout_rate: number;
  accumulated_beans: number;
  diamond_balance: number;
  created_at: string;
  owner?: { full_name: string; display_id: number };
};

export default function AgenciesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, members: 0, payouts: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [agenciesRes, payoutSumRes] = await Promise.all([
      supabase
        .from('agencies')
        .select('*, owner:profiles!agencies_owner_id_fkey(full_name, display_id)')
        .order('created_at', { ascending: false }),
      supabase
        .from('agency_payouts')
        .select('bdt_value')
        .eq('status', 'paid'),
    ]);

    if (agenciesRes.data) {
      setAgencies(agenciesRes.data as any);
      const totalMembers = agenciesRes.data.reduce((sum, a) => sum + (a.member_count || 0), 0);
      const totalPayouts = (payoutSumRes.data || []).reduce(
        (sum, p) => sum + Number(p.bdt_value || 0), 0
      );
      setStats({
        total: agenciesRes.data.length,
        members: totalMembers,
        payouts: totalPayouts,
      });
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    const ok = window.confirm(`Set agency status to "${status}"?`);
    if (!ok) return;
    const { error } = await supabase.from('agencies').update({ status }).eq('id', id);
    if (!error) {
      setAgencies((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } else {
      alert('Update failed: ' + error.message);
    }
  }

  // Search has to be null-safe across all three fields:
  //   - name and code are normally NOT NULL, but FK joins can return
  //     partial rows during a backfill window.
  //   - owner.full_name is NULLABLE — a host can delete their account
  //     after creating an agency, leaving the agency owner record
  //     with a NULL profile join. The old code crashed in that case.
  //
  // Normalising every side through String() + lowercase, then a single
  // includes() check, makes the filter safe and case-insensitive.
  const q = (searchTerm || '').toLowerCase();
  const matches = (s: unknown) => String(s ?? '').toLowerCase().includes(q);
  const filtered = q === ''
    ? agencies
    : agencies.filter((a) =>
        matches(a.name) || matches(a.code) || matches(a.owner?.full_name)
      );

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      verified: 'bg-green-400/10 text-green-400',
      pending: 'bg-yellow-400/10 text-yellow-400',
      suspended: 'bg-red-400/10 text-red-400',
    };
    return map[status] || 'bg-gray-400/10 text-gray-400';
  };

  const colorFromName = (name: string) => {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-emerald-500', 'bg-cyan-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Agency Management</h2>
          <p className="text-gray-500 mt-1">Verify, suspend, and monitor official agencies.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search by name, code, owner..."
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 w-72"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all"
            onClick={fetchData}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Agencies', value: stats.total.toLocaleString(), icon: ShieldCheck, color: 'text-blue-400' },
          { label: 'Total Hosts (in agencies)', value: stats.members.toLocaleString(), icon: Users, color: 'text-green-400' },
          { label: 'Total Payouts Sent', value: `৳${stats.payouts.toLocaleString()}`, icon: TrendingUp, color: 'text-pink-400' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-6">
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-xl bg-white/5 ${stat.color}`}>
                <stat.icon size={24} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-black text-white mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Agency</th>
              <th className="px-6 py-4 font-black">Owner</th>
              <th className="px-6 py-4 font-black text-center">Hosts</th>
              <th className="px-6 py-4 font-black">Stock</th>
              <th className="px-6 py-4 font-black">Rate</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && agencies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline mr-2" size={18} /> Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No agencies found.
                </td>
              </tr>
            ) : (
              filtered.map((agency) => (
                <tr key={agency.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${colorFromName(agency.name)} flex items-center justify-center font-bold text-lg`}>
                        {agency.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white">{agency.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{agency.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-300">{agency.owner?.full_name || '—'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{agency.owner?.display_id ? `ID: ${agency.owner.display_id}` : ''}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-white">{agency.member_count || 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[11px] text-yellow-400">🫘 {(agency.accumulated_beans || 0).toLocaleString()}</p>
                    <p className="text-[11px] text-cyan-400">💎 {(agency.diamond_balance || 0).toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-300">৳{agency.payout_rate}/100k</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${statusBadge(agency.status)}`}>
                      {agency.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {agency.status !== 'verified' && (
                        <button
                          className="p-2 hover:bg-green-400/10 rounded-lg text-gray-400 hover:text-green-400 transition-all"
                          onClick={() => updateStatus(agency.id, 'verified')}
                          title="Verify"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                      {agency.status !== 'suspended' && (
                        <button
                          className="p-2 hover:bg-red-400/10 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                          onClick={() => updateStatus(agency.id, 'suspended')}
                          title="Suspend"
                        >
                          <Ban size={16} />
                        </button>
                      )}
                      {agency.status === 'suspended' && (
                        <button
                          className="p-2 hover:bg-yellow-400/10 rounded-lg text-gray-400 hover:text-yellow-400 transition-all"
                          onClick={() => updateStatus(agency.id, 'pending')}
                          title="Unsuspend (set pending)"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}