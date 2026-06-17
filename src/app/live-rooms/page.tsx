"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Radio, Search, Loader2, Users as UsersIcon, Diamond, Eye, StopCircle, Ban, Clock,
} from 'lucide-react';

type StreamRow = {
  id: string;
  host_id: string;
  title: string | null;
  stream_type: string | null;
  status: 'live' | 'ended' | string;
  viewer_count: number;
  total_gifts: number;
  total_earnings: number;
  started_at: string;
  ended_at: string | null;
  host: { full_name: string; display_id: number; avatar_url: string | null; is_banned: boolean } | null;
};

export default function LiveRoomsPage() {
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-live-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('live_streams')
      .select(`
        id, host_id, title, stream_type, status, viewer_count,
        total_gifts, total_earnings, started_at, ended_at,
        host:profiles!live_streams_host_id_fkey(full_name, display_id, avatar_url, is_banned)
      `)
      .eq('status', 'live')
      .order('started_at', { ascending: false });
    setRows((data as any) || []);
    setLoading(false);
  }

  async function endStream(s: StreamRow) {
    const reason = window.prompt(`End ${s.host?.full_name || 'this host'}'s stream?\n\nReason (optional):`);
    if (reason === null) return; // cancelled
    setBusyId(s.id);
    const { data, error } = await supabase.rpc('admin_end_live_stream', {
      p_stream_id: s.id,
      p_reason:    reason || null,
    });
    setBusyId(null);
    if (error) { alert('Failed: ' + error.message); return; }
    if (!data?.success) { alert(data?.message || 'Failed'); return; }
  }

  async function banHost(s: StreamRow) {
    if (!s.host_id) return;
    if (!window.confirm(`Ban ${s.host?.full_name || 'this user'} from the platform? They will be unable to log in.`)) return;
    setBusyId(s.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: true })
      .eq('id', s.host_id);
    setBusyId(null);
    if (error) { alert('Failed: ' + error.message); return; }
    // Also end their live stream so they're kicked out.
    await supabase.rpc('admin_end_live_stream', { p_stream_id: s.id, p_reason: 'Auto: host banned' });
  }

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.host?.full_name?.toLowerCase().includes(s) ||
      r.title?.toLowerCase().includes(s) ||
      String(r.host?.display_id ?? '').includes(s)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
            <Radio className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              Live Rooms
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 text-xs font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {rows.length} LIVE
              </span>
            </h1>
            <p className="text-xs text-gray-500">All currently active broadcasts — end or ban from here</p>
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text"
          placeholder="Search host / title / display id…"
          className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-red-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <Radio className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No live rooms right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const minutes = Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000);
            return (
              <div key={s.id} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 flex items-center gap-3">
                  {s.host?.avatar_url ? (
                    <img src={s.host.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {s.host?.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{s.host?.full_name || 'Unknown'}</p>
                    <p className="text-[10px] text-gray-500">ID {s.host?.display_id ?? s.host_id.slice(0, 8)}</p>
                  </div>
                  {s.host?.is_banned && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-300 flex items-center gap-1">
                      <Ban size={10} /> Banned
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-white text-sm font-semibold truncate">{s.title || 'Live now'}</p>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat icon={<Eye size={11} />} label="Viewers" value={(s.viewer_count ?? 0).toLocaleString()} />
                    <Stat icon={<Diamond size={11} />} label="Earnings" value={(s.total_earnings ?? 0).toLocaleString()} />
                    <Stat icon={<Clock size={11} />} label="Minutes" value={String(minutes)} />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => endStream(s)}
                      disabled={busyId === s.id}
                      className="flex-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {busyId === s.id ? <Loader2 className="animate-spin" size={12} /> : <StopCircle size={12} />}
                      End
                    </button>
                    <button
                      onClick={() => banHost(s)}
                      disabled={busyId === s.id || !!s.host?.is_banned}
                      className="flex-1 bg-red-500/15 hover:bg-red-500/25 text-red-300 font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Ban size={12} /> Ban host
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#0E111E] rounded-xl p-2">
      <p className="text-[9px] uppercase text-gray-500 font-bold tracking-widest flex items-center justify-center gap-1">{icon} {label}</p>
      <p className="text-sm font-black text-white mt-0.5">{value}</p>
    </div>
  );
}