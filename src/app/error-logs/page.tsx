"use client";
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import {
  Bug, Search, Loader2, X, CheckCircle2, RefreshCw, AlertTriangle, Clock,
  Smartphone, MessageSquare,
} from 'lucide-react';

type LogRow = {
  id: string;
  user_id: string | null;
  app_version: string | null;
  platform: string | null;
  screen: string | null;
  error_message: string;
  stack: string | null;
  context: any;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  user: { full_name: string; display_id: number } | null;
};

const RANGES: { id: string; label: string; hours: number | null }[] = [
  { id: '24h', label: 'Last 24h', hours: 24 },
  { id: '7d',  label: 'Last 7d',  hours: 24 * 7 },
  { id: '30d', label: 'Last 30d', hours: 24 * 30 },
  { id: 'all', label: 'All time', hours: null },
];

export default function ErrorLogsPage() {
  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [rows, setRows]         = useState<LogRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [range, setRange]       = useState<typeof RANGES[number]['id']>('7d');
  const [platform, setPlatform] = useState<'all' | 'android' | 'ios'>('all');
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [active, setActive]     = useState<LogRow | null>(null);
  const [reviewNote, setReviewNote]   = useState('');
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchLogs();
    const ch = supabase
      .channel('admin-error-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'error_logs' }, () => fetchLogs())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, isSuperAdmin]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (platform !== 'all' && r.platform !== platform) return false;
    if (unreviewedOnly && r.reviewed_at) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.error_message?.toLowerCase().includes(s) ||
      r.screen?.toLowerCase().includes(s) ||
      r.app_version?.toLowerCase().includes(s) ||
      r.user?.full_name?.toLowerCase().includes(s) ||
      String(r.user?.display_id ?? '').includes(s)
    );
  }), [rows, platform, unreviewedOnly, search]);

  const unreviewedCount = useMemo(() => rows.filter((r) => !r.reviewed_at).length, [rows]);

  if (roleLoading || !isSuperAdmin) return null;

  async function fetchLogs() {
    setLoading(true);
    const hours = RANGES.find((r) => r.id === range)?.hours;
    let q = supabase
      .from('error_logs')
      .select(`
        *,
        user:profiles!error_logs_user_id_fkey(full_name, display_id)
      `)
      .order('created_at', { ascending: false })
      .limit(300);
    if (hours != null) {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      q = q.gte('created_at', since);
    }
    const { data } = await q;
    setRows((data as LogRow[]) || []);
    setLoading(false);
  }

  async function markReviewed(log: LogRow, note: string) {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('mark_error_log_reviewed', {
      p_log_id: log.id,
      p_note:   note?.trim() || null,
    });
    setSubmitting(false);
    if (error) { alert('Failed: ' + error.message); return; }
    if (!data?.success) { alert(data?.message || 'Failed'); return; }
    setActive(null);
    setReviewNote('');
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
            <Bug className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              Error Logs
              {unreviewedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 text-xs font-bold">
                  <AlertTriangle size={10} /> {unreviewedCount} unreviewed
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-500">Self-hosted crash reports from the mobile ErrorBoundary</p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="Search message / screen / version / user…"
            className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-rose-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${range === r.id ? 'bg-rose-500/20 text-rose-300' : 'text-gray-500 hover:text-white'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1">
          {(['all', 'android', 'ios'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${platform === p ? 'bg-rose-500/20 text-rose-300' : 'text-gray-500 hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300 bg-[#1E1A34] border border-[#251B45] rounded-xl px-3">
          <input
            type="checkbox"
            checked={unreviewedOnly}
            onChange={(e) => setUnreviewedOnly(e.target.checked)}
          />
          Unreviewed only
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-rose-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <Bug className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No crash reports match this filter — that's a good sign.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.id}
              className={`bg-[#1E1A34] border rounded-2xl p-4 hover:border-rose-500/30 cursor-pointer transition-all ${r.reviewed_at ? 'border-[#251B45] opacity-70' : 'border-rose-500/20'}`}
              onClick={() => { setActive(r); setReviewNote(r.review_note || ''); }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {r.reviewed_at ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-300">
                        <CheckCircle2 size={10} /> Reviewed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-300">
                        New
                      </span>
                    )}
                    {r.platform && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-300">
                        <Smartphone size={10} /> {r.platform}
                      </span>
                    )}
                    {r.app_version && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-gray-400 bg-black/30">v{r.app_version}</span>
                    )}
                    {r.screen && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-gray-400 bg-black/30">{r.screen}</span>
                    )}
                    <span className="text-xs text-gray-500 ml-auto flex items-center gap-1">
                      <Clock size={11} /> {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-white font-mono text-sm break-words">{r.error_message}</p>
                  {r.user && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      User: {r.user.full_name} · ID {r.user.display_id}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center flex-shrink-0">
                  <Bug size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-white truncate">{active.screen || 'Crash'}</h3>
                  <p className="text-xs text-gray-500">{new Date(active.created_at).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => setActive(null)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Message</p>
                <p className="text-sm text-rose-300 font-mono bg-[#0E111E] border border-rose-500/15 rounded-xl p-3 break-words">
                  {active.error_message}
                </p>
              </div>
              {active.stack && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Stack</p>
                  <pre className="text-xs text-gray-400 font-mono bg-[#0E111E] border border-[#251B45] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {active.stack}
                  </pre>
                </div>
              )}
              {active.context && (
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Context</p>
                  <pre className="text-xs text-gray-400 font-mono bg-[#0E111E] border border-[#251B45] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(active.context, null, 2)}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-[#0E111E] rounded-lg p-2">
                  <span className="block text-[9px] uppercase text-gray-500 font-bold">Platform</span>
                  <span className="text-white">{active.platform || '—'}</span>
                </div>
                <div className="bg-[#0E111E] rounded-lg p-2">
                  <span className="block text-[9px] uppercase text-gray-500 font-bold">App version</span>
                  <span className="text-white">{active.app_version || '—'}</span>
                </div>
                <div className="bg-[#0E111E] rounded-lg p-2">
                  <span className="block text-[9px] uppercase text-gray-500 font-bold">User</span>
                  <span className="text-white truncate block">{active.user?.full_name || '—'}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1 flex items-center gap-1">
                  <MessageSquare size={11} /> Triage notes
                </p>
                <textarea
                  rows={3}
                  placeholder="What did you find? What's the fix?"
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
              </div>
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button
                onClick={() => setActive(null)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl"
              >
                Close
              </button>
              {!active.reviewed_at && (
                <button
                  onClick={() => markReviewed(active, reviewNote)}
                  disabled={submitting}
                  className="flex-[2] bg-gradient-to-r from-rose-500 to-pink-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-rose-500/20"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={16} />}
                  Mark as reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
