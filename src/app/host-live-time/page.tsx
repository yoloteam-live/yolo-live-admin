'use client';

/**
 * Host Live Time
 * ==============
 * Audio Live and Video Live time per host, side by side, plus how many days each
 * host actually appeared on video. get_host_stats answers this one host at a
 * time; this page uses the aggregate RPC so every host can be ranked and
 * compared in a single view.
 *
 * Two day counts are shown on purpose:
 *   Video days  - distinct Dhaka days with any video session
 *   Valid days  - days meeting the platform's existing >= 35 minute rule
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Video, Mic, AlertTriangle, Search } from 'lucide-react';

type Row = {
  host_id: string;
  host_name: string | null;
  host_display_id: number | null;
  agency_name: string | null;
  video_minutes: number;
  audio_minutes: number;
  video_days: number;
  valid_video_days: number;
  sessions: number;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function hm(min: number) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export default function HostLiveTimePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [start, setStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [end, setEnd] = useState(() => isoDay(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc('admin_host_live_time_report', {
      p_start: new Date(`${start}T00:00:00.000Z`).toISOString(),
      p_end: new Date(`${end}T23:59:59.999Z`).toISOString(),
      p_limit: 500,
    });
    if (rpcErr) setError(rpcErr.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  }, [start, end]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r.host_name || '').toLowerCase().includes(needle)
      || String(r.host_display_id ?? '').includes(needle)
      || (r.agency_name || '').toLowerCase().includes(needle));
  }, [rows, q]);

  const totals = useMemo(() => filtered.reduce(
    (a, r) => ({
      video: a.video + Number(r.video_minutes || 0),
      audio: a.audio + Number(r.audio_minutes || 0),
    }),
    { video: 0, audio: 0 },
  ), [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Host Live Time</h1>
        <p className="text-sm text-gray-500 mt-1">
          Audio and Video live time per host, counted on Asia/Dhaka days. Sessions
          crossing midnight are split across both days.
        </p>
      </div>

      <div className="glass-card p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-2.5 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-2.5 text-sm text-white" />
        </div>
        <button onClick={() => void load()}
          className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm">
          Apply
        </button>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search host, ID or agency"
            className="w-full bg-[#1A1230] border border-[#251B45] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
            <Video size={13} className="text-yellow-400" /> Total video time
          </p>
          <p className="text-xl font-black text-white mt-1">{hm(totals.video)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
            <Mic size={13} className="text-violet-400" /> Total audio time
          </p>
          <p className="text-xl font-black text-white mt-1">{hm(totals.audio)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Hosts</p>
          <p className="text-xl font-black text-white mt-1">{filtered.length.toLocaleString()}</p>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 flex items-center gap-2 text-red-300 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <div className="glass-card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-cyan-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">No live activity in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-white/10">
                  <th className="text-left py-3 px-5">Host</th>
                  <th className="text-left">ID</th>
                  <th className="text-left">Agency</th>
                  <th className="text-right">Video time</th>
                  <th className="text-right">Audio time</th>
                  <th className="text-right">Video days</th>
                  <th className="text-right">Valid days</th>
                  <th className="text-right pr-5">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.host_id} className="border-b border-white/5">
                    <td className="py-3 px-5 text-white">{r.host_name || '—'}</td>
                    <td className="text-gray-400">{r.host_display_id ?? '—'}</td>
                    <td className="text-gray-500 max-w-[220px] truncate">{r.agency_name || '—'}</td>
                    <td className="text-right font-bold text-yellow-300">{hm(r.video_minutes)}</td>
                    <td className="text-right font-bold text-violet-300">{hm(r.audio_minutes)}</td>
                    <td className="text-right text-gray-300">{r.video_days}</td>
                    <td className="text-right text-emerald-300">{r.valid_video_days}</td>
                    <td className="text-right pr-5 text-gray-400">{r.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
