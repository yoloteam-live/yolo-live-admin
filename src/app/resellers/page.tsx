"use client";
import { useState, useEffect } from 'react';
import {
  Search, Store, TrendingUp, Users, Loader2, CheckCircle2, Ban, Clock, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Reseller = {
  id: string;
  name: string;
  avatar_url: string | null;
  contact_link: string;
  type: string;
  status: string;
  priority: number;
  diamond_stock: number;
  total_sold: number;
  user_id: string | null;
  created_at: string;
  user?: { full_name: string; display_id: number };
};

export default function ResellersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'busy' | 'inactive'>('all');
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, busy: 0, inactive: 0, totalStock: 0, totalSold: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('resellers')
      .select('*, user:profiles!resellers_user_id_fkey(full_name, display_id)')
      .order('priority', { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const list = (data as Reseller[]) || [];
    setResellers(list);
    setStats({
      total:    list.length,
      active:   list.filter((r) => r.status === 'active').length,
      busy:     list.filter((r) => r.status === 'busy').length,
      inactive: list.filter((r) => r.status === 'inactive').length,
      totalStock: list.reduce((s, r) => s + (r.diamond_stock || 0), 0),
      totalSold:  list.reduce((s, r) => s + (r.total_sold || 0), 0),
    });
    setLoading(false);
  }

  async function updateStatus(reseller: Reseller, status: string) {
    const verb = status === 'inactive' ? 'BLOCK' : status === 'busy' ? 'Pause' : 'Activate';
    if (!window.confirm(`${verb} reseller "${reseller.name}"?`)) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Not signed in');

    const { data, error } = await supabase.rpc('set_reseller_status', {
      p_reseller_id: reseller.id,
      p_admin_id:    user.id,
      p_status:      status,
    });
    if (error) return alert('Failed: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');

    fetchData();
  }

  const filtered = resellers
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.contact_link.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.user?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active:   'bg-green-400/10 text-green-400',
      busy:     'bg-yellow-400/10 text-yellow-400',
      inactive: 'bg-red-400/10 text-red-400',
    };
    return map[status] || 'bg-gray-400/10 text-gray-400';
  };

  const platformLabel = (link: string) => {
    if (link.includes('wa.me') || link.includes('whatsapp')) return 'WhatsApp';
    if (link.includes('t.me') || link.includes('telegram')) return 'Telegram';
    return 'Link';
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
          <h2 className="text-3xl font-black text-white">Reseller Management</h2>
          <p className="text-gray-500 mt-1">All approved resellers — block, unblock, monitor stock & sales.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search by name, contact, owner..."
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Resellers', value: stats.total.toLocaleString(),    icon: Store,        color: 'text-blue-400' },
          { label: 'Active Now',      value: stats.active.toLocaleString(),   icon: CheckCircle2, color: 'text-green-400' },
          { label: 'Blocked',         value: stats.inactive.toLocaleString(), icon: Ban,          color: 'text-red-400' },
          { label: 'Lifetime Sold',   value: `${stats.totalSold.toLocaleString()} 💎`, icon: TrendingUp, color: 'text-pink-400' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-5">
            <div className="flex justify-between items-start">
              <div className={`p-2 rounded-xl bg-white/5 ${stat.color}`}>
                <stat.icon size={20} />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-gray-500 text-xs font-medium">{stat.label}</p>
              <h3 className="text-xl font-black text-white mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'busy', 'inactive'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
              statusFilter === s
                ? 'bg-pink-500 text-white'
                : 'bg-[#1E1A34] border border-[#251B45] text-gray-400 hover:text-white'
            }`}
          >
            {s} {s !== 'all' && `(${stats[s] || 0})`}
          </button>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Reseller</th>
              <th className="px-6 py-4 font-black">Linked User</th>
              <th className="px-6 py-4 font-black">Contact</th>
              <th className="px-6 py-4 font-black">Stock</th>
              <th className="px-6 py-4 font-black">Sold</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && resellers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline mr-2" size={18} /> Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No resellers found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        <div className={`w-10 h-10 rounded-xl ${colorFromName(r.name)} flex items-center justify-center font-bold text-lg`}>
                          {r.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-white">{r.name}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{r.type} • priority {r.priority}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {r.user?.full_name ? (
                      <>
                        <p className="font-medium text-gray-300">{r.user.full_name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">ID: {r.user.display_id}</p>
                      </>
                    ) : (
                      <span className="text-gray-600 text-xs">Demo / unlinked</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={r.contact_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400 hover:underline"
                    >
                      {platformLabel(r.contact_link)} ↗
                    </a>
                    <p className="text-[10px] text-gray-600 font-mono truncate max-w-[180px]">{r.contact_link}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-cyan-300">
                    💎 {(r.diamond_stock || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-xs text-pink-300">
                    {(r.total_sold || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {r.status !== 'active' && (
                        <button
                          className="p-2 hover:bg-green-400/10 rounded-lg text-gray-400 hover:text-green-400 transition-all"
                          onClick={() => updateStatus(r, 'active')}
                          title="Activate"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                      {r.status !== 'busy' && (
                        <button
                          className="p-2 hover:bg-yellow-400/10 rounded-lg text-gray-400 hover:text-yellow-400 transition-all"
                          onClick={() => updateStatus(r, 'busy')}
                          title="Set busy (hides from wallet list)"
                        >
                          <Clock size={16} />
                        </button>
                      )}
                      {r.status !== 'inactive' && (
                        <button
                          className="p-2 hover:bg-red-400/10 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                          onClick={() => updateStatus(r, 'inactive')}
                          title="Block"
                        >
                          <Ban size={16} />
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