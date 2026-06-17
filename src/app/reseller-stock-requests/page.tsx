"use client";
import { useState, useEffect } from 'react';
import {
  Search, Loader2, CheckCircle2, XCircle, RefreshCw, Diamond, Store,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type StockReq = {
  id: string;
  reseller_id: string;
  requested_by: string;
  diamond_amount: number;
  bdt_value: number | null;
  notes: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
  fulfilled_at: string | null;
  reseller?: { name: string; contact_link: string; diamond_stock: number };
  requester?: { full_name: string; display_id: number; phone_number: string };
  fulfiller?: { full_name: string };
};

const STATUSES = ['pending', 'contacted', 'fulfilled', 'cancelled', 'all'];

export default function ResellerStockRequestsPage() {
  const [requests, setRequests] = useState<StockReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentAdminId(data.user.id);
    });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [statusFilter]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-reseller-stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_stock_requests' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAll() {
    setLoading(true);
    let q = supabase
      .from('reseller_stock_requests')
      .select(
        `*,
         reseller:resellers!reseller_stock_requests_reseller_id_fkey(name, contact_link, diamond_stock),
         requester:profiles!reseller_stock_requests_requested_by_fkey(full_name, display_id, phone_number),
         fulfiller:profiles!reseller_stock_requests_fulfilled_by_fkey(full_name)`
      )
      .order('created_at', { ascending: false })
      .limit(100);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) console.error('Reseller stock fetch error:', error);
    else setRequests((data || []) as any);
    setLoading(false);
  }

  async function fulfill(id: string, resellerName: string, amount: number) {
    if (!currentAdminId) return;
    const ok = window.confirm(
      `Fulfill ${amount.toLocaleString()} diamonds to ${resellerName}?\n\nMake sure you have received their payment first.`
    );
    if (!ok) return;
    const notes = window.prompt('Optional fulfillment notes (e.g. tx ref):') || null;
    setActionLoading(id);
    const { data, error } = await supabase.rpc('fulfill_reseller_stock_request', {
      p_request_id: id,
      p_admin_id: currentAdminId,
      p_notes: notes,
    });
    setActionLoading(null);
    if (error) return alert('Error: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');
    alert(`Fulfilled. ${amount.toLocaleString()} diamonds added to ${resellerName}.`);
    fetchAll();
  }

  async function markContacted(id: string) {
    setActionLoading(id);
    const { error } = await supabase.from('reseller_stock_requests').update({ status: 'contacted' }).eq('id', id);
    setActionLoading(null);
    if (error) alert('Error: ' + error.message);
    else fetchAll();
  }

  async function cancel(id: string) {
    const ok = window.confirm('Cancel this stock request?');
    if (!ok) return;
    setActionLoading(id);
    const { error } = await supabase.from('reseller_stock_requests').update({ status: 'cancelled' }).eq('id', id);
    setActionLoading(null);
    if (error) alert('Error: ' + error.message);
    else fetchAll();
  }

  const statusBadge = (s: string) => ({
    pending:   'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    contacted: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    fulfilled: 'bg-green-400/10 text-green-400 border-green-400/20',
    cancelled: 'bg-red-400/10 text-red-400 border-red-400/20',
  } as any)[s] || 'bg-gray-400/10 text-gray-400';

  const filtered = requests.filter((r) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      r.reseller?.name?.toLowerCase().includes(s) ||
      r.requester?.full_name?.toLowerCase().includes(s) ||
      r.requester?.phone_number?.includes(s)
    );
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white">Reseller Stock Requests</h2>
            {pendingCount > 0 && (
              <span className="px-3 py-1 bg-yellow-400/10 border border-yellow-400/30 rounded-full text-yellow-400 text-xs font-bold animate-pulse">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">Resellers requesting bulk diamonds from the master supply.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search reseller, user…"
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 w-72"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-[#1E1A34] border border-[#251B45] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>)}
          </select>
          <button className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all" onClick={fetchAll}>
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Request</th>
              <th className="px-6 py-4 font-black">Reseller</th>
              <th className="px-6 py-4 font-black">Owner</th>
              <th className="px-6 py-4 font-black">Amount</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && requests.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={18} /> Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No reseller stock requests.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                <td className="px-6 py-4">
                  <p className="font-mono text-[11px] text-pink-500 font-bold">{r.id.slice(0, 8)}…</p>
                  <p className="text-[10px] text-gray-500 mt-1">{new Date(r.created_at).toLocaleString()}</p>
                  {r.notes && <p className="text-[10px] text-gray-400 mt-1 italic">{r.notes}</p>}
                  {r.fulfiller && (
                    <p className="text-[10px] text-green-400 mt-1">✓ By {r.fulfiller.full_name}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <p className="font-bold text-white flex items-center gap-2">
                    <Store size={14} className="text-purple-400" />
                    {r.reseller?.name || '—'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Current stock: 💎 {(r.reseller?.diamond_stock || 0).toLocaleString()}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-white">{r.requester?.full_name || '—'}</p>
                  <p className="text-[10px] text-gray-500">{r.requester?.phone_number}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <Diamond size={14} className="text-cyan-400" />
                    <span className="font-black text-white">{r.diamond_amount.toLocaleString()}</span>
                  </div>
                  {r.bdt_value && (
                    <p className="text-[11px] text-green-400 mt-1">৳{Number(r.bdt_value).toLocaleString()}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${statusBadge(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {r.status === 'pending' || r.status === 'contacted' ? (
                    <div className="flex justify-end gap-2">
                      {r.status === 'pending' && (
                        <button
                          onClick={() => markContacted(r.id)}
                          disabled={actionLoading === r.id}
                          className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-all"
                        >
                          Mark Contacted
                        </button>
                      )}
                      <button
                        onClick={() => fulfill(r.id, r.reseller?.name || 'Reseller', r.diamond_amount)}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                      >
                        {actionLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Fulfill
                      </button>
                      <button
                        onClick={() => cancel(r.id)}
                        disabled={actionLoading === r.id}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all"
                      >
                        <XCircle size={12} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-500 text-xs italic">No actions</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}