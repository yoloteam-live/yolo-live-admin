"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import {
  UserX, Search, Loader2, X, RotateCcw, Clock, Hash, Mail,
} from 'lucide-react';

type Row = {
  id: string;
  full_name: string | null;
  display_id: number | null;
  is_deleted: boolean | null;
  is_banned: boolean | null;
  deleted_at: string | null;
  diamonds: number | null;
  beans: number | null;
};

const PAGE_SIZE = 100;

export default function DeletedAccountsPage() {
  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [active, setActive]   = useState<Row | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [submitting, setSubmitting]       = useState(false);
  // Page index (0-based) + total count so admins can navigate past the
  // first 100 deletions. The old `.limit(500)` silently hid anything
  // beyond the cap; now we show "Page 1 of 7" with prev/next.
  const [page, setPage]           = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const ch = supabase
      .channel('admin-deleted-accounts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetch())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function fetch() {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('profiles')
      .select('id, full_name, display_id, is_deleted, is_banned, deleted_at, diamonds, beans',
              { count: 'exact' })
      .eq('is_deleted', true)
      .order('deleted_at', { ascending: false, nullsFirst: false })
      .range(from, to);
    setRows((data as Row[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }

  async function restore(row: Row, reason: string) {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('admin_restore_account', {
      p_user_id: row.id,
      p_reason:  reason?.trim() || null,
    });
    setSubmitting(false);
    if (error)            { alert('Failed: ' + error.message); return; }
    if (!data?.success)   { alert(data?.message || 'Failed'); return; }
    setActive(null);
    setRestoreReason('');
  }

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.full_name?.toLowerCase().includes(s) ||
      String(r.display_id ?? '').includes(s) ||
      r.id.toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center">
            <UserX className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Deleted Accounts</h1>
            <p className="text-xs text-gray-500">
              Soft-deleted profiles (PII anonymised). Restore lifts ban + is_deleted; the user fills the name/avatar back themselves.
            </p>
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text"
          placeholder="Search by display id / uuid…"
          className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-slate-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <UserX className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No deleted accounts.</p>
        </div>
      ) : (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Display ID</th>
                <th className="px-4 py-3 text-left">UUID</th>
                <th className="px-4 py-3 text-right">Remaining 💎</th>
                <th className="px-4 py-3 text-right">Remaining 🫘</th>
                <th className="px-4 py-3 text-left">Deleted at</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-semibold">{r.display_id ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{r.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right text-cyan-300 font-mono">{(r.diamonds ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-amber-300 font-mono">{(r.beans ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setActive(r); setRestoreReason(''); }}
                      className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 ml-auto"
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination footer. Only renders when there's more than one
              page so the single-page case stays uncluttered. */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-white/5 text-xs">
              <span className="text-gray-400">
                Page <b className="text-white">{page + 1}</b> of{' '}
                <b className="text-white">{Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</b>
                {' '}· {totalCount.toLocaleString()} total deleted accounts
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold py-1.5 px-3 rounded-lg"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= totalCount}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-bold py-1.5 px-3 rounded-lg"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Restore modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <RotateCcw size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Restore account?</h3>
                <p className="text-xs text-gray-500">Display ID {active.display_id} · {active.id.slice(0, 8)}…</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                <p>This will:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Clear <code>is_deleted</code> and <code>is_banned</code></li>
                  <li>Reset push + DM notification preferences to ON</li>
                  <li>Allow the user to log in again</li>
                </ul>
                <p className="pt-1">
                  The user's name, phone and avatar were anonymised at deletion — those don't come back automatically.
                  The user will need to refill their profile on next login.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#0E111E] rounded-lg p-2 border border-[#251B45]">
                  <span className="block text-[9px] uppercase text-gray-500 font-bold flex items-center gap-1">
                    <Hash size={10} /> Display ID
                  </span>
                  <span className="text-white">{active.display_id ?? '—'}</span>
                </div>
                <div className="bg-[#0E111E] rounded-lg p-2 border border-[#251B45]">
                  <span className="block text-[9px] uppercase text-gray-500 font-bold flex items-center gap-1">
                    <Clock size={10} /> Deleted
                  </span>
                  <span className="text-white">
                    {active.deleted_at ? new Date(active.deleted_at).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-gray-500 font-bold flex items-center gap-1 mb-1">
                  <Mail size={10} /> Reason (optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. support ticket #1234, user requested undo within 24h"
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  value={restoreReason}
                  onChange={(e) => setRestoreReason(e.target.value)}
                />
                <p className="text-[10px] text-gray-600 mt-1">Stored in admin_audit_log.</p>
              </div>
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button
                onClick={() => setActive(null)}
                disabled={submitting}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => restore(active, restoreReason)}
                disabled={submitting}
                className="flex-[2] bg-gradient-to-r from-emerald-500 to-green-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : <RotateCcw size={16} />}
                Restore account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
