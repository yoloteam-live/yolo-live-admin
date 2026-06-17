"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShieldAlert, Search, Loader2, X, CheckCircle2, XCircle,
  Ban, Eye, Clock, MessageSquare,
} from 'lucide-react';

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  room_id: string | null;
  reason: string;
  evidence_url: string | null;
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  note: string | null;
  reporter: { full_name: string; display_id: number; avatar_url: string | null } | null;
  reported: { full_name: string; display_id: number; avatar_url: string | null; is_banned?: boolean } | null;
};

const STATUSES = ['all', 'pending', 'reviewed', 'action_taken', 'dismissed'] as const;
type StatusKey = typeof STATUSES[number];

const STATUS_STYLE: Record<string, string> = {
  pending:      'bg-yellow-400/10 text-yellow-300 border-yellow-400/20',
  reviewed:     'bg-blue-400/10 text-blue-300 border-blue-400/20',
  action_taken: 'bg-purple-400/10 text-purple-300 border-purple-400/20',
  dismissed:    'bg-gray-400/10 text-gray-400 border-gray-400/20',
};

export default function ReportsPage() {
  const [rows, setRows]   = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusKey>('pending');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ReportRow | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReports();
    const ch = supabase
      .channel('admin-user-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_reports' }, () => fetchReports())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, []);

  async function fetchReports() {
    setLoading(true);
    const { data } = await supabase
      .from('user_reports')
      .select(`
        *,
        reporter:profiles!user_reports_reporter_id_fkey(full_name, display_id, avatar_url),
        reported:profiles!user_reports_reported_user_id_fkey(full_name, display_id, avatar_url, is_banned)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows((data as ReportRow[]) || []);
    setLoading(false);
  }

  async function resolve(action: 'dismiss' | 'review' | 'action_taken', ban: boolean = false) {
    if (!active) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc('resolve_user_report', {
      p_report_id: active.id,
      p_action:    action,
      p_notes:     resolveNotes.trim() || null,
      p_ban_user:  ban,
    });
    setSubmitting(false);
    if (error) { alert('Failed: ' + error.message); return; }
    if (!data?.success) { alert(data?.message || 'Failed'); return; }
    setActive(null);
    setResolveNotes('');
  }

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.reason.toLowerCase().includes(s) ||
      r.reporter?.full_name?.toLowerCase().includes(s) ||
      r.reported?.full_name?.toLowerCase().includes(s) ||
      String(r.reporter?.display_id || '').includes(s) ||
      String(r.reported?.display_id || '').includes(s)
    );
  });

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
            <ShieldAlert className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">User Reports</h1>
            <p className="text-xs text-gray-500">Moderation queue from live-room report flow</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 rounded-xl px-3 py-1.5 text-sm font-bold flex items-center gap-2">
            <Clock size={14} /> {pendingCount} pending
          </div>
        )}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="Search reason / user / ID…"
            className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                statusFilter === s ? 'bg-red-500/20 text-red-300' : 'text-gray-500 hover:text-white'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-red-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <ShieldAlert className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No reports match this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-4 hover:border-red-500/30 transition-all cursor-pointer"
              onClick={() => { setActive(r); setResolveNotes(''); }}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${STATUS_STYLE[r.status]}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                    {r.reported?.is_banned && (
                      <span className="px-2 py-0.5 rounded-md border border-red-400/30 bg-red-400/10 text-red-300 text-[10px] font-black uppercase flex items-center gap-1">
                        <Ban size={9} /> Banned
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-white font-bold text-sm mb-1">
                    <span className="text-gray-500">Reason:</span> {r.reason}
                  </p>
                  <p className="text-xs text-gray-400">
                    <span className="text-purple-300 font-semibold">{r.reporter?.full_name}</span>
                    {' '}reported{' '}
                    <span className="text-red-300 font-semibold">{r.reported?.full_name}</span>
                    {' '}(ID {r.reported?.display_id})
                  </p>
                  {r.note && (
                    <p className="text-xs text-gray-500 italic mt-2 line-clamp-2">{r.note}</p>
                  )}
                </div>
                <Eye size={16} className="text-gray-500 flex-shrink-0 mt-1" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolve modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
                  <ShieldAlert size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Review Report</h3>
                  <p className="text-xs text-gray-500">{new Date(active.created_at).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => setActive(null)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0E111E] border border-[#251B45] rounded-xl p-3">
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Reporter</p>
                  <p className="text-sm text-white font-semibold">{active.reporter?.full_name}</p>
                  <p className="text-xs text-gray-500">ID {active.reporter?.display_id}</p>
                </div>
                <div className="bg-[#0E111E] border border-red-500/20 rounded-xl p-3">
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Reported user</p>
                  <p className="text-sm text-white font-semibold">{active.reported?.full_name}</p>
                  <p className="text-xs text-gray-500">ID {active.reported?.display_id}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Reason</p>
                <p className="text-sm text-white bg-[#0E111E] border border-[#251B45] rounded-xl p-3">{active.reason}</p>
              </div>

              {active.note && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Existing notes</p>
                  <p className="text-xs text-gray-400 bg-[#0E111E] border border-[#251B45] rounded-xl p-3 whitespace-pre-wrap">{active.note}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1 flex items-center gap-1">
                  <MessageSquare size={11} /> Admin notes (optional)
                </p>
                <textarea
                  rows={3}
                  placeholder="What did you find? Action taken?"
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="p-6 bg-white/5 flex flex-wrap gap-2">
              <button
                onClick={() => resolve('dismiss')}
                disabled={submitting}
                className="flex-1 min-w-[120px] bg-gray-500/15 hover:bg-gray-500/25 text-gray-300 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <XCircle size={14} /> Dismiss
              </button>
              <button
                onClick={() => resolve('review')}
                disabled={submitting}
                className="flex-1 min-w-[120px] bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Eye size={14} /> Mark reviewed
              </button>
              <button
                onClick={() => resolve('action_taken')}
                disabled={submitting}
                className="flex-1 min-w-[120px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Action taken
              </button>
              <button
                onClick={() => resolve('action_taken', true)}
                disabled={submitting || active.reported?.is_banned}
                className="flex-1 min-w-[120px] bg-red-500/15 hover:bg-red-500/25 text-red-300 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : <Ban size={14} />}
                Ban user
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}