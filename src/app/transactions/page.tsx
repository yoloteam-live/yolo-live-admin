"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';

type Tx = {
  id: string;
  user_id: string;
  related_user_id: string | null;
  type: string;
  currency: string;
  amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  user?: { full_name: string; display_id: number };
  related_user?: { full_name: string; display_id: number };
};

const TX_TYPES = ['all', 'topup', 'gift_sent', 'gift_received', 'game_bet', 'game_win', 'bean_convert', 'agency_payout', 'agency_transfer'];
const STATUSES = ['all', 'pending', 'completed', 'failed', 'reversed'];

export default function TransactionsPage() {
  // Super-admin only — transaction ledger reveals every money move on
  // the platform, so we don't expose it to managers.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchTransactions();
  }, [typeFilter, statusFilter, isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function fetchTransactions() {
    setLoading(true);

    // Step 1: pull the transactions themselves (no embedded joins — FK hints
    // can collide because both user_id and related_user_id point to profiles).
    let q = supabase
      .from('transactions')
      .select(
        'id, user_id, related_user_id, type, currency, amount, status, notes, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (typeFilter !== 'all') q = q.eq('type', typeFilter);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data, error, count } = await q;
    if (error) {
      console.error('TX fetch error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setLoading(false);
      return;
    }

    const rows = (data || []) as Tx[];

    // Step 2: resolve user names in one round-trip
    const ids = Array.from(new Set(
      rows.flatMap((r) => [r.user_id, r.related_user_id]).filter(Boolean) as string[]
    ));
    let nameMap = new Map<string, { full_name: string; display_id: number }>();
    if (ids.length > 0) {
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, display_id')
        .in('id', ids);
      if (profErr) {
        console.warn('Profile lookup partial:', profErr.message);
      } else if (profs) {
        nameMap = new Map(profs.map((p: any) => [p.id, { full_name: p.full_name, display_id: p.display_id }]));
      }
    }

    setTransactions(rows.map((r) => ({
      ...r,
      user: r.user_id ? nameMap.get(r.user_id) : undefined,
      related_user: r.related_user_id ? nameMap.get(r.related_user_id) : undefined,
    })));
    setTotalCount(count || 0);
    setLoading(false);
  }

  const filtered = transactions.filter((tx) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      tx.id.toLowerCase().includes(s) ||
      tx.user?.full_name?.toLowerCase().includes(s) ||
      tx.user?.display_id?.toString().includes(s) ||
      tx.related_user?.full_name?.toLowerCase().includes(s)
    );
  });

  const typeIcon = (type: string) => {
    if (type === 'topup' || type === 'gift_received' || type === 'game_win' || type === 'agency_transfer') {
      return <ArrowDownLeft size={14} className="text-green-400" />;
    }
    return <ArrowUpRight size={14} className="text-blue-400" />;
  };

  const typeColor = (type: string) => {
    if (type === 'topup') return 'text-green-400';
    if (type.includes('gift')) return 'text-pink-400';
    if (type.includes('game')) return 'text-purple-400';
    if (type.includes('agency')) return 'text-blue-400';
    if (type === 'bean_convert') return 'text-yellow-400';
    return 'text-gray-300';
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Transactions</h2>
          <p className="text-gray-500 mt-1">
            All money movements across the platform. ({totalCount.toLocaleString()} total)
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search by ID, name..."
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-[#1E1A34] border border-[#251B45] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {TX_TYPES.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>
            ))}
          </select>
          <select
            className="bg-[#1E1A34] border border-[#251B45] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
            ))}
          </select>
          <button
            className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all"
            onClick={fetchTransactions}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Filter size={20} />}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Transaction</th>
              <th className="px-6 py-4 font-black">User</th>
              <th className="px-6 py-4 font-black">Type</th>
              <th className="px-6 py-4 font-black">Amount</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black">Date</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline mr-2" size={18} /> Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No transactions found.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => (
                <tr key={tx.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-4">
                    <p className="font-mono text-[11px] text-pink-500 font-bold">{tx.id.slice(0, 8)}…</p>
                    {tx.notes && <p className="text-[10px] text-gray-500 mt-1">{tx.notes}</p>}
                  </td>
                  <td className="px-6 py-4">
                    {/* "Unknown" used to render as a calm grey label that
                        admins read as "user with no name" — but it actually
                        signals "we couldn't resolve this user_id to a
                        profile row" (deleted account or profile-lookup
                        partial failure). Amber-toned + uuid suffix makes
                        the distinction obvious during support work. */}
                    {tx.user?.full_name ? (
                      <>
                        <p className="font-bold text-white">{tx.user.full_name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">ID: {tx.user.display_id || '—'}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-amber-300 flex items-center gap-1">
                          ⚠ Deleted user
                        </p>
                        <p className="text-[10px] text-gray-500 font-mono" title={tx.user_id || ''}>
                          uid: {tx.user_id ? tx.user_id.slice(0, 8) + '…' : '—'}
                        </p>
                      </>
                    )}
                    {tx.related_user && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        ↳ {tx.related_user.full_name}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {typeIcon(tx.type)}
                      <span className={typeColor(tx.type)}>{tx.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className={`font-black ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase">{tx.currency}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {tx.status === 'completed' && <CheckCircle2 size={14} className="text-green-400" />}
                      {tx.status === 'pending' && <Clock size={14} className="text-yellow-400" />}
                      {tx.status === 'failed' && <XCircle size={14} className="text-red-400" />}
                      {tx.status === 'reversed' && <XCircle size={14} className="text-gray-400" />}
                      <span className={`text-[10px] font-bold uppercase ${
                        tx.status === 'completed' ? 'text-green-400' :
                        tx.status === 'pending' ? 'text-yellow-400' :
                        tx.status === 'failed' ? 'text-red-400' : 'text-gray-400'
                      }`}>{tx.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {new Date(tx.created_at).toLocaleString()}
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