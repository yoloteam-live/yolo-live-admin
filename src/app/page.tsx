"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users, Diamond, Sparkles, Activity, TrendingUp, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type RecentTx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  user?: { full_name: string; display_id: number };
};

type TopAgency = {
  id: string;
  name: string;
  member_count: number;
  total_paid: number;
};

export default function Dashboard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalUsers: 0,
    activeLive: 0,
    totalDiamonds: 0,
    totalBeans: 0,
    pendingTopups: 0,
  });
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);
  const [topAgencies, setTopAgencies] = useState<TopAgency[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [
        usersRes,
        liveRes,
        balanceRes,
        topupRes,
        recentTxRes,
        agenciesRes,
        payoutsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('live_streams').select('id', { count: 'exact', head: true }).eq('status', 'live'),
        supabase.from('profiles').select('diamonds, beans'),
        supabase.from('topup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('transactions')
          .select('id, type, amount, currency, status, created_at, user:profiles!transactions_user_id_fkey(full_name, display_id)')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('agencies').select('id, name, member_count').order('member_count', { ascending: false }).limit(5),
        supabase.from('agency_payouts').select('agency_id, bdt_value').eq('status', 'paid'),
      ]);

      setConnected(!usersRes.error);

      // Totals
      let totalDiamonds = 0, totalBeans = 0;
      (balanceRes.data || []).forEach((p) => {
        totalDiamonds += p.diamonds || 0;
        totalBeans += p.beans || 0;
      });

      setStats({
        totalUsers: usersRes.count || 0,
        activeLive: liveRes.count || 0,
        totalDiamonds,
        totalBeans,
        pendingTopups: topupRes.count || 0,
      });

      setRecentTx((recentTxRes.data || []) as any);

      // Compute top agencies with total paid
      const payoutMap: Record<string, number> = {};
      (payoutsRes.data || []).forEach((p) => {
        payoutMap[p.agency_id] = (payoutMap[p.agency_id] || 0) + Number(p.bdt_value || 0);
      });
      const enriched = (agenciesRes.data || []).map((a) => ({
        ...a,
        total_paid: payoutMap[a.id] || 0,
      })).sort((a, b) => b.total_paid - a.total_paid);
      setTopAgencies(enriched);

    } catch (e) {
      console.error(e);
      setConnected(false);
    }
    setLoading(false);
  }

  const compactNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  };

  const statCards = [
    { name: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: 'text-blue-400' },
    { name: 'Active Live', value: stats.activeLive.toLocaleString(), icon: Activity, color: 'text-green-400' },
    { name: 'Total Diamonds', value: compactNum(stats.totalDiamonds), icon: Diamond, color: 'text-pink-400' },
    { name: 'Total Beans', value: compactNum(stats.totalBeans), icon: Sparkles, color: 'text-yellow-400' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white">Dashboard Overview</h2>
            {connected === true && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
                <CheckCircle2 size={10} /> Live Data
              </span>
            )}
            {connected === false && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-full border border-red-400/20">
                <XCircle size={10} /> Disconnected
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">Real-time snapshot of platform activity.</p>
        </div>

        {stats.pendingTopups > 0 && (
          <Link
            href="/topups"
            className="bg-yellow-500/10 border border-yellow-400/30 text-yellow-400 hover:bg-yellow-500/20 px-5 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 animate-pulse"
          >
            ⚠ {stats.pendingTopups} pending top-up{stats.pendingTopups > 1 ? 's' : ''} — review now
          </Link>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="glass-card p-6 group hover:border-pink-500/30 transition-all cursor-default">
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-xl bg-white/5 ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-gray-500 text-sm font-medium">{stat.name}</p>
              <h3 className="text-2xl font-black text-white mt-1 tracking-tight">
                {loading ? <Loader2 className="animate-spin inline" size={20} /> : stat.value}
              </h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Recent Transactions</h3>
            <Link href="/transactions" className="text-pink-500 text-sm font-bold hover:underline">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-white/5">
                  <th className="pb-4 font-black">User</th>
                  <th className="pb-4 font-black">Type</th>
                  <th className="pb-4 font-black">Amount</th>
                  <th className="pb-4 font-black">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-500"><Loader2 className="animate-spin inline" size={16} /></td></tr>
                ) : recentTx.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-500">No transactions yet.</td></tr>
                ) : recentTx.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-all">
                    <td className="py-4">
                      <p className="font-bold text-white">{tx.user?.full_name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500 font-mono">ID: {tx.user?.display_id || '—'}</p>
                    </td>
                    <td className="py-4 text-gray-300 text-xs">{tx.type}</td>
                    <td className="py-4">
                      <span className={`font-black ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-gray-500 ml-1 uppercase">{tx.currency}</span>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded-full border ${
                        tx.status === 'completed' ? 'bg-green-400/10 text-green-400 border-green-400/20'
                        : tx.status === 'pending' ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20'
                        : 'bg-red-400/10 text-red-400 border-red-400/20'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Agencies */}
        <div className="glass-card p-6">
          <h3 className="text-xl font-bold mb-6">Top Agencies</h3>
          <div className="space-y-5">
            {loading ? (
              <Loader2 className="animate-spin mx-auto" size={20} />
            ) : topAgencies.length === 0 ? (
              <p className="text-gray-500 text-sm text-center">No agencies yet.</p>
            ) : topAgencies.map((agency, i) => {
              const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-emerald-500'];
              return (
                <div key={agency.id} className="flex items-center gap-4 group cursor-default">
                  <div className={`w-10 h-10 rounded-xl ${colors[i % colors.length]} flex items-center justify-center font-bold text-lg shadow-lg shadow-black/20`}>
                    {agency.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white truncate">{agency.name}</p>
                    <p className="text-xs text-gray-500">{agency.member_count || 0} hosts</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-white text-sm">৳{agency.total_paid.toLocaleString()}</p>
                    <TrendingUp size={12} className="text-green-400 inline ml-1" />
                  </div>
                </div>
              );
            })}
          </div>
          <Link
            href="/agencies"
            className="block w-full mt-8 py-3 rounded-xl border border-[#251B45] text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all text-center"
          >
            View All Agencies
          </Link>
        </div>
      </div>
    </div>
  );
}