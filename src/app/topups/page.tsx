"use client";
import { useState, useEffect } from 'react';
import {
  Search, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Diamond, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type TopUp = {
  id: string;
  user_id: string;
  reseller_id: string;
  package_amount: number;
  bdt_value: number;
  status: string;
  notes: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  user?: { full_name: string; display_id: number; phone_number: string };
  reseller?: { name: string; contact_link: string };
  confirmer?: { full_name: string };
};

const STATUSES = ['all', 'pending', 'contacted', 'confirmed', 'cancelled'];

export default function TopupsPage() {
  const [requests, setRequests] = useState<TopUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  // Pagination — the old code capped at 100 silently. With heavy traffic
  // the support team would never see pending requests past the first
  // page until they aged out of the filter, which is exactly the wrong
  // direction.
  const [page, setPage]             = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  useEffect(() => {
    // Load current admin id
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentAdminId(data.user.id);
    });
    fetchRequests();
  }, [statusFilter, page]);

  // When the user changes filter, jump back to page 0 — otherwise a
  // mid-filter page index can fall past the end of the new result set
  // and the table renders empty until they manually nudge "Prev".
  useEffect(() => { setPage(0); }, [statusFilter]);

  const PAGE_SIZE = 50;

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-topup-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topup_requests' }, () => {
        fetchRequests();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRequests() {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    let q = supabase
      .from('topup_requests')
      .select(
        `id, user_id, reseller_id, package_amount, bdt_value, status, notes, confirmed_by, confirmed_at, created_at,
         user:profiles!topup_requests_user_id_fkey(full_name, display_id, phone_number),
         reseller:resellers!topup_requests_reseller_id_fkey(name, contact_link),
         confirmer:profiles!topup_requests_confirmed_by_fkey(full_name)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data, error, count } = await q;
    if (error) {
      console.error('Topup fetch error:', error);
    } else {
      setRequests((data || []) as any);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }

  async function handleConfirm(id: string, userName: string, amount: number) {
    if (!currentAdminId) {
      alert('Admin session not loaded. Please refresh.');
      return;
    }
    const ok = window.confirm(
      `Confirm payment from ${userName}?\n\n${amount.toLocaleString()} diamonds will be credited.\n\nMake sure you have received the payment first.`
    );
    if (!ok) return;

    setActionLoading(id);
    const { data, error } = await supabase.rpc('confirm_topup_request', {
      p_request_id: id,
      p_admin_id: currentAdminId,
    });
    setActionLoading(null);

    if (error) {
      alert('Failed: ' + error.message);
    } else if (!data?.success) {
      alert('Failed: ' + (data?.message || 'Unknown error'));
    } else {
      alert(`Confirmed. ${amount.toLocaleString()} diamonds credited.`);
      fetchRequests();
    }
  }

  async function handleCancel(id: string) {
    const ok = window.confirm('Cancel this request?');
    if (!ok) return;
    setActionLoading(id);
    // Go through the SECURITY DEFINER RPC. A plain UPDATE used to silently
    // hit RLS (topup_requests had no UPDATE policy) and look like success
    // even though nothing changed.
    const { data, error } = await supabase.rpc('cancel_topup_request', {
      p_request_id: id,
    });
    setActionLoading(null);
    if (error) {
      alert('Failed: ' + error.message);
    } else if (!data?.success) {
      alert('Failed: ' + (data?.message || 'Unknown error'));
    } else {
      fetchRequests();
    }
  }

  async function handleMarkContacted(id: string) {
    setActionLoading(id);
    const { data, error } = await supabase.rpc('mark_topup_contacted', {
      p_request_id: id,
    });
    setActionLoading(null);
    if (error) {
      alert('Failed: ' + error.message);
    } else if (!data?.success) {
      alert('Failed: ' + (data?.message || 'Unknown error'));
    } else {
      fetchRequests();
    }
  }

  const filtered = requests.filter((r) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      r.id.toLowerCase().includes(s) ||
      r.user?.full_name?.toLowerCase().includes(s) ||
      r.user?.display_id?.toString().includes(s) ||
      r.user?.phone_number?.includes(s) ||
      r.reseller?.name?.toLowerCase().includes(s)
    );
  });

  const statusBadge = (status: string) => ({
    pending: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    contacted: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    confirmed: 'bg-green-400/10 text-green-400 border-green-400/20',
    cancelled: 'bg-red-400/10 text-red-400 border-red-400/20',
  }[status] || 'bg-gray-400/10 text-gray-400');

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white">Top-Up Approvals</h2>
            {pendingCount > 0 && (
              <span className="px-3 py-1 bg-yellow-400/10 border border-yellow-400/30 rounded-full text-yellow-400 text-xs font-bold animate-pulse">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">
            Confirm manual payments and credit diamonds to users.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search by user, phone, reseller..."
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
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>
            ))}
          </select>
          <button
            className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all"
            onClick={fetchRequests}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Request</th>
              <th className="px-6 py-4 font-black">User</th>
              <th className="px-6 py-4 font-black">Reseller</th>
              <th className="px-6 py-4 font-black">Amount</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline mr-2" size={18} /> Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No top-up requests with this filter.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-4">
                    <p className="font-mono text-[11px] text-pink-500 font-bold">{r.id.slice(0, 8)}…</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.confirmer && (
                      <p className="text-[10px] text-green-400 mt-1">
                        ✓ By {r.confirmer.full_name}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{r.user?.full_name || 'Unknown'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">ID: {r.user?.display_id || '—'}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{r.user?.phone_number || ''}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-300">{r.reseller?.name || '—'}</p>
                    {r.reseller?.contact_link && (
                      <a
                        href={r.reseller.contact_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline mt-1"
                      >
                        Contact <ExternalLink size={10} />
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Diamond size={14} className="text-cyan-400" />
                      <span className="font-black text-white">{r.package_amount.toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-green-400 mt-1">৳{Number(r.bdt_value).toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${statusBadge(r.status)}`}>
                      {r.status === 'pending' && <Clock size={10} />}
                      {r.status === 'confirmed' && <CheckCircle2 size={10} />}
                      {r.status === 'cancelled' && <XCircle size={10} />}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {r.status === 'pending' || r.status === 'contacted' ? (
                      <div className="flex justify-end gap-2">
                        {r.status === 'pending' && (
                          <button
                            className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-all"
                            onClick={() => handleMarkContacted(r.id)}
                            disabled={actionLoading === r.id}
                          >
                            Mark Contacted
                          </button>
                        )}
                        <button
                          className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          onClick={() => handleConfirm(r.id, r.user?.full_name || 'User', r.package_amount)}
                          disabled={actionLoading === r.id}
                        >
                          {actionLoading === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Confirm
                        </button>
                        <button
                          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all"
                          onClick={() => handleCancel(r.id)}
                          disabled={actionLoading === r.id}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs italic">No actions</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-white/5 text-xs">
            <span className="text-gray-400">
              Page <b className="text-white">{page + 1}</b> of{' '}
              <b className="text-white">{Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</b>
              {' '}· {totalCount.toLocaleString()} matching requests
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold py-1.5 px-3 rounded-lg"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loading || (page + 1) * PAGE_SIZE >= totalCount}
                className="bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold py-1.5 px-3 rounded-lg"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}