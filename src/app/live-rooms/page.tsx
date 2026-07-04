"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import {
  Ban,
  Clock,
  Diamond,
  Eye,
  Loader2,
  Mic,
  PlayCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  StopCircle,
  UserMinus,
  Users,
  Video,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

type HostProfile = {
  full_name: string | null;
  display_id: number | null;
  avatar_url: string | null;
  is_banned: boolean | null;
  role?: string | null;
  country?: string | null;
};

type StreamRow = {
  id: string;
  broadcaster_id: string;
  type: 'video' | 'audio' | string | null;
  title: string | null;
  tag: string | null;
  cover_url: string | null;
  status: 'live' | 'ended' | 'banned' | string;
  current_viewers: number | null;
  peak_viewers: number | null;
  total_gifts: number | null;
  total_earnings: number | null;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at?: string | null;
  profiles?: HostProfile | HostProfile[] | null;
  host: HostProfile | null;
};

type RoomMember = {
  id: string;
  name?: string;
  displayId?: number | null;
  avatar?: string | null;
  vipType?: string | null;
  level?: number | null;
};

type RoomGuest = RoomMember & {
  videoEnabled?: boolean;
  muted?: boolean;
};

type RoomState = {
  title?: string;
  goal?: number;
  locked?: boolean;
  lockedSeats?: number[];
  audioSlotCount?: number;
  hostMuted?: boolean;
  admins?: string[];
  blockedUsers?: string[];
  activeGuests?: Array<RoomGuest | null>;
};

const FRESH_WINDOW_MS = 90_000;
const PAGE_SIZE = 80;

function normalizeHost(value: StreamRow['profiles']): HostProfile | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function displayName(user: Partial<RoomMember> | HostProfile | null | undefined, fallback = 'Unknown') {
  if (!user) return fallback;
  return ('full_name' in user ? user.full_name : user.name) || fallback;
}

function formatMinutes(startedAt: string) {
  const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function heartbeatTone(stream: StreamRow) {
  const source = stream.last_heartbeat_at || stream.started_at;
  const age = Date.now() - new Date(source).getTime();
  if (!stream.last_heartbeat_at && age > 30_000) return { label: 'No heartbeat', stale: true };
  if (age > FRESH_WINDOW_MS) return { label: 'Stale', stale: true };
  return { label: `${Math.max(0, Math.round(age / 1000))}s ago`, stale: false };
}

export default function LiveRoomsPage() {
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<StreamRow | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [roomStatus, setRoomStatus] = useState<'idle' | 'joining' | 'ready' | 'error'>('idle');
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await supabase.rpc('cleanup_stale_live_streams');
      } catch {}
      const freshSince = Date.now() - FRESH_WINDOW_MS;
      const { data, error } = await supabase
        .from('live_streams')
        .select(`
          id, broadcaster_id, type, title, tag, cover_url, status,
          current_viewers, peak_viewers, total_gifts, total_earnings,
          started_at, ended_at, last_heartbeat_at,
          profiles:broadcaster_id(full_name, display_id, avatar_url, is_banned, role, country)
        `)
        .eq('status', 'live')
        .order('current_viewers', { ascending: false })
        .order('total_gifts', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;
      const liveRows = ((data || []) as StreamRow[])
        .map((row) => ({ ...row, host: normalizeHost(row.profiles) }))
        .filter((row) => {
          if (row.host?.is_banned) return false;
          const heartbeatMs = row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : 0;
          const startedMs = new Date(row.started_at).getTime();
          return heartbeatMs >= freshSince || (!row.last_heartbeat_at && startedMs >= freshSince);
        });

      setRows(liveRows);
      setSelected((current) => {
        if (!current) return current;
        return liveRows.find((row) => row.id === current.id) || null;
      });
    } catch (err) {
      console.error('load live rooms failed:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void load(); });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 350);
    };
    const ch = supabase
      .channel(`admin-live-rooms-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, scheduleLoad)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [load]);

  useEffect(() => {
    let mounted = true;
    if (!selected?.broadcaster_id) {
      queueMicrotask(() => {
        if (!mounted) return;
        setRoomState(null);
        setRoomMembers([]);
        setRoomStatus('idle');
      });
      return () => { mounted = false; };
    }

    queueMicrotask(() => {
      if (!mounted) return;
      setRoomState(null);
      setRoomMembers([]);
      setRoomStatus('joining');
    });

    const roomName = `room_${selected.broadcaster_id}`;
    const channel = supabase.channel(roomName, {
      config: { broadcast: { self: true } },
    });
    roomChannelRef.current = channel;

    const readPresence = () => {
      const state = channel.presenceState() as Record<string, RoomMember[]>;
      const members = Object.values(state)
        .map((entry) => entry?.[0])
        .filter((entry): entry is RoomMember => !!entry?.id && entry.id !== selected.broadcaster_id);
      setRoomMembers(members);
    };

    channel
      .on('presence', { event: 'sync' }, readPresence)
      .on('broadcast', { event: 'room_state' }, ({ payload }) => {
        setRoomState((prev) => ({ ...(prev || {}), ...((payload || {}) as RoomState) }));
      })
      .on('broadcast', { event: 'seat_update' }, ({ payload }) => {
        setRoomState((prev) => ({
          ...(prev || {}),
          activeGuests: Array.isArray(payload?.activeGuests) ? payload.activeGuests : prev?.activeGuests,
          audioSlotCount: typeof payload?.audioSlotCount === 'number' ? payload.audioSlotCount : prev?.audioSlotCount,
        }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRoomStatus('ready');
          readPresence();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRoomStatus('error');
        }
      });

    return () => {
      mounted = false;
      roomChannelRef.current = null;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [selected?.broadcaster_id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => (
      displayName(row.host).toLowerCase().includes(needle) ||
      (row.title || '').toLowerCase().includes(needle) ||
      (row.tag || '').toLowerCase().includes(needle) ||
      String(row.host?.display_id ?? '').includes(needle) ||
      row.broadcaster_id.toLowerCase().includes(needle)
    ));
  }, [rows, search]);

  const activeGuests = useMemo(
    () => (roomState?.activeGuests || []).filter((guest): guest is RoomGuest => !!guest?.id),
    [roomState?.activeGuests]
  );

  async function publishRoomEvent(stream: StreamRow, event: string, payload: Record<string, unknown>) {
    if (selected?.broadcaster_id === stream.broadcaster_id && roomChannelRef.current) {
      await roomChannelRef.current.send({ type: 'broadcast', event, payload });
      return;
    }

    const channel = supabase.channel(`room_${stream.broadcaster_id}`, {
      config: { broadcast: { self: false } },
    });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1200);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    try {
      await channel.send({ type: 'broadcast', event, payload });
    } finally {
      setTimeout(() => {
        try { supabase.removeChannel(channel); } catch {}
      }, 250);
    }
  }

  async function endStream(stream: StreamRow, reasonText?: string) {
    const reason = reasonText ?? window.prompt(`End ${displayName(stream.host, 'this host')}'s stream?\n\nReason (optional):`);
    if (reason === null) return;
    setBusyId(stream.id);
    const { data, error } = await supabase.rpc('admin_end_live_stream', {
      p_stream_id: stream.id,
      p_reason: reason || null,
    });
    if (!error && data?.success) {
      await publishRoomEvent(stream, 'end_live', { id: stream.broadcaster_id, admin: true });
      await load();
    }
    setBusyId(null);
    if (error) alert('Failed: ' + error.message);
    else if (!data?.success) alert(data?.message || 'Failed');
  }

  async function banHost(stream: StreamRow) {
    if (!stream.broadcaster_id) return;
    if (!window.confirm(`Ban ${displayName(stream.host, 'this user')} and close their live now?`)) return;
    setBusyId(stream.id);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setBusyId(null);
      alert('Not signed in');
      return;
    }
    const { data, error } = await supabase.rpc('admin_update_user', {
      p_admin_id: authUser.id,
      p_user_id: stream.broadcaster_id,
      p_is_banned: true,
      p_status: 'banned',
      p_full_name: null,
      p_diamonds: null,
      p_beans: null,
      p_role: null,
    });
    if (!error && data?.success) {
      await supabase.rpc('admin_end_live_stream', {
        p_stream_id: stream.id,
        p_reason: 'Auto: host banned from live rooms dashboard',
      });
      await publishRoomEvent(stream, 'end_live', { id: stream.broadcaster_id, admin: true });
      await load();
    }
    setBusyId(null);
    if (error) alert('Failed: ' + error.message);
    else if (!data?.success) alert(data?.message || 'Failed');
  }

  async function kickGuest(guest: RoomGuest) {
    if (!selected || !guest.id || !roomState?.activeGuests) return;
    if (!window.confirm(`Remove ${guest.name || 'this guest'} from the call?`)) return;
    const nextGuests = roomState.activeGuests.map((item) => item?.id === guest.id ? null : item);
    setRoomState((prev) => ({ ...(prev || {}), activeGuests: nextGuests }));
    await publishRoomEvent(selected, 'seat_update', {
      activeGuests: nextGuests,
      audioSlotCount: roomState.audioSlotCount,
      admin: true,
    });
  }

  async function blockViewer(member: RoomMember) {
    if (!selected || !member.id) return;
    if (!window.confirm(`Kick and block ${member.name || 'this viewer'} from this live room?`)) return;
    setBusyId(selected.id);
    const { data, error } = await supabase.rpc('admin_room_block_user', {
      p_room_host: selected.broadcaster_id,
      p_target: member.id,
      p_reason: 'Blocked from admin live rooms dashboard',
    });
    if (!error && data?.success) {
      const blockedUsers = Array.from(new Set([...(roomState?.blockedUsers || []), member.id]));
      const nextState: RoomState = { ...(roomState || {}), blockedUsers };
      setRoomState(nextState);
      await publishRoomEvent(selected, 'admin_room_block', { target: member.id, blockedUsers, admin: true });
      await publishRoomEvent(selected, 'room_state', nextState as Record<string, unknown>);
    }
    setBusyId(null);
    if (error) alert('Failed: ' + error.message);
    else if (!data?.success) alert(data?.message || 'Failed');
  }

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
            <p className="text-xs text-gray-500">Active broadcasts, embedded monitor, and room controls</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <input
          type="text"
          placeholder="Search host, title, tag, display id..."
          className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((stream) => {
            const heartbeat = heartbeatTone(stream);
            const viewerCount = stream.current_viewers ?? stream.peak_viewers ?? 0;
            return (
              <div key={stream.id} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setSelected(stream)}
                  className="w-full p-4 border-b border-white/5 flex items-center gap-3 text-left hover:bg-white/[0.03]"
                >
                  <Avatar src={stream.host?.avatar_url || stream.cover_url} name={displayName(stream.host)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{displayName(stream.host)}</p>
                    <p className="text-[10px] text-gray-500">ID {stream.host?.display_id ?? stream.broadcaster_id.slice(0, 8)}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${stream.type === 'audio' ? 'bg-cyan-400/10 text-cyan-300' : 'bg-fuchsia-400/10 text-fuchsia-300'}`}>
                    {stream.type === 'audio' ? <Mic size={11} /> : <Video size={11} />}
                    {stream.type || 'video'}
                  </span>
                </button>

                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-white text-sm font-semibold truncate">{stream.title || 'Live now'}</p>
                    <p className="text-[10px] text-gray-500 truncate">{stream.tag || 'No tag'} - {formatMinutes(stream.started_at)}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat icon={<Eye size={11} />} label="Viewers" value={viewerCount.toLocaleString()} />
                    <Stat icon={<Diamond size={11} />} label="Earnings" value={(stream.total_earnings ?? 0).toLocaleString()} />
                    <Stat icon={<Clock size={11} />} label="Runtime" value={formatMinutes(stream.started_at)} />
                  </div>

                  <div className={`flex items-center gap-2 text-[11px] font-bold ${heartbeat.stale ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {heartbeat.stale ? <WifiOff size={13} /> : <Wifi size={13} />}
                    Heartbeat {heartbeat.label}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setSelected(stream)}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-1"
                    >
                      <PlayCircle size={13} /> Open
                    </button>
                    <button
                      onClick={() => endStream(stream)}
                      disabled={busyId === stream.id}
                      className="flex-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {busyId === stream.id ? <Loader2 className="animate-spin" size={12} /> : <StopCircle size={12} />}
                      End
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-3xl h-full bg-[#151225] border-l border-[#251B45] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-[#151225]/95 border-b border-[#251B45] p-4 flex items-center gap-3">
              <Avatar src={selected.host?.avatar_url || selected.cover_url} name={displayName(selected.host)} />
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black text-white truncate">{displayName(selected.host)}</h2>
                <p className="text-xs text-gray-500 truncate">
                  ID {selected.host?.display_id ?? selected.broadcaster_id.slice(0, 8)} - {selected.title || 'Live now'}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <AdminAgoraPlayer stream={selected} />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat icon={<Users size={12} />} label="Current" value={(selected.current_viewers ?? 0).toLocaleString()} />
                <Stat icon={<Eye size={12} />} label="Peak" value={(selected.peak_viewers ?? 0).toLocaleString()} />
                <Stat icon={<Diamond size={12} />} label="Diamonds" value={(selected.total_earnings ?? 0).toLocaleString()} />
                <Stat icon={<Clock size={12} />} label="Runtime" value={formatMinutes(selected.started_at)} />
              </div>

              <section className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-white font-black">Room Controls</h3>
                    <p className="text-[11px] text-gray-500">
                      Room channel: {roomStatus === 'ready' ? 'connected' : roomStatus}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{selected.type || 'video'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => endStream(selected)}
                    disabled={busyId === selected.id}
                    className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <StopCircle size={15} /> End Live
                  </button>
                  <button
                    onClick={() => endStream(selected, 'Admin kicked host')}
                    disabled={busyId === selected.id}
                    className="bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UserMinus size={15} /> Kick Host
                  </button>
                  <button
                    onClick={() => banHost(selected)}
                    disabled={busyId === selected.id || !!selected.host?.is_banned}
                    className="bg-red-500/15 hover:bg-red-500/25 text-red-300 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Ban size={15} /> Ban Host
                  </button>
                </div>
              </section>

              <section className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-4">
                <h3 className="text-white font-black mb-3">Seated Guests</h3>
                {activeGuests.length === 0 ? (
                  <p className="text-sm text-gray-500">No seated guests detected yet.</p>
                ) : (
                  <div className="space-y-2">
                    {activeGuests.map((guest) => (
                      <UserRow key={guest.id} user={guest}>
                        <button
                          onClick={() => kickGuest(guest)}
                          className="px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 text-xs font-bold flex items-center gap-1"
                        >
                          <UserMinus size={12} /> Kick
                        </button>
                        <button
                          onClick={() => blockViewer(guest)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-bold flex items-center gap-1"
                        >
                          <Ban size={12} /> Block
                        </button>
                      </UserRow>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-4">
                <h3 className="text-white font-black mb-3">Room Viewers</h3>
                {roomMembers.length === 0 ? (
                  <p className="text-sm text-gray-500">Viewer presence will appear when the room channel syncs.</p>
                ) : (
                  <div className="space-y-2">
                    {roomMembers.map((member) => (
                      <UserRow key={member.id} user={member}>
                        <button
                          onClick={() => blockViewer(member)}
                          disabled={busyId === selected.id}
                          className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                        >
                          <ShieldAlert size={12} /> Kick and Block
                        </button>
                      </UserRow>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ src, name }: { src?: string | null; name?: string }) {
  if (src) {
    return <img src={src} alt="" className="w-11 h-11 rounded-full object-cover bg-[#0E111E]" />;
  }
  return (
    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-black">
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#0E111E] rounded-xl p-2 min-w-0">
      <p className="text-[9px] uppercase text-gray-500 font-bold tracking-widest flex items-center justify-center gap-1 truncate">{icon} {label}</p>
      <p className="text-sm font-black text-white mt-0.5 truncate">{value}</p>
    </div>
  );
}

function UserRow({ user, children }: { user: RoomMember; children: React.ReactNode }) {
  return (
    <div className="bg-[#0E111E] rounded-xl p-3 flex items-center gap-3">
      <Avatar src={user.avatar} name={user.name} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-bold truncate">{user.name || 'Viewer'}</p>
        <p className="text-[10px] text-gray-500 truncate">ID {user.displayId || user.id.slice(0, 8)}{user.vipType && user.vipType !== 'none' ? ` - ${user.vipType}` : ''}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}

function AdminAgoraPlayer({ stream }: { stream: StreamRow }) {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'joining' | 'live' | 'audio' | 'empty' | 'error'>('joining');
  const [message, setMessage] = useState('Joining as subscriber...');
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null);

  useEffect(() => {
    let cancelled = false;
    let client: IAgoraRTCClient | null = null;
    const tracks: IRemoteVideoTrack[] = [];

    async function join() {
      try {
        setStatus('joining');
        setMessage('Joining as subscriber...');
        const { data: { session } } = await supabase.auth.getSession();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!session?.access_token || !supabaseUrl) throw new Error('Missing admin session or Supabase URL');

        const res = await fetch(`${supabaseUrl}/functions/v1/agora-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ channelName: stream.broadcaster_id, role: 'subscriber' }),
        });
        const tokenData = await res.json() as { token?: string; appId?: string; uid?: number; error?: string };
        if (!res.ok || !tokenData?.token || !tokenData?.appId) {
          throw new Error(tokenData?.error || `Token request failed (${res.status})`);
        }

        const AgoraRTC = await import('agora-rtc-sdk-ng');
        if (cancelled) return;
        const rtcClient = AgoraRTC.default.createClient({ mode: 'live', codec: 'vp8' });
        client = rtcClient;
        await rtcClient.setClientRole('audience');

        rtcClient.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          await rtcClient.subscribe(remoteUser, mediaType);
          if (mediaType === 'audio' && remoteUser.audioTrack) {
            remoteUser.audioTrack.play();
            setStatus((prev) => prev === 'live' ? 'live' : 'audio');
            setMessage('Receiving room audio');
          }
          if (mediaType === 'video' && remoteUser.videoTrack) {
            tracks.push(remoteUser.videoTrack);
            setRemoteVideoTrack(remoteUser.videoTrack);
            setStatus('live');
            setMessage('Receiving live video');
          }
        });

        rtcClient.on('user-unpublished', (_remoteUser: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
          if (mediaType === 'video') {
            setRemoteVideoTrack(null);
            setStatus(stream.type === 'audio' ? 'audio' : 'empty');
            setMessage(stream.type === 'audio' ? 'Audio room connected' : 'Waiting for host video');
          }
        });

        await rtcClient.join(tokenData.appId, stream.broadcaster_id, tokenData.token, tokenData.uid);
        if (!cancelled) {
          setStatus(stream.type === 'audio' ? 'audio' : 'empty');
          setMessage(stream.type === 'audio' ? 'Audio room connected' : 'Waiting for host video');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Unable to join live');
        }
      }
    }

    join();
    return () => {
      cancelled = true;
      setRemoteVideoTrack(null);
      tracks.forEach((track) => {
        try { track.stop(); } catch {}
      });
      if (client) {
        try { client.leave(); } catch {}
        try { client.removeAllListeners(); } catch {}
      }
    };
  }, [stream.broadcaster_id, stream.type]);

  useEffect(() => {
    if (!remoteVideoTrack || !videoRef.current) return;
    try { remoteVideoTrack.play(videoRef.current); } catch {}
    return () => {
      try { remoteVideoTrack.stop(); } catch {}
    };
  }, [remoteVideoTrack]);

  return (
    <div className="bg-black border border-[#251B45] rounded-2xl overflow-hidden">
      <div className="aspect-video relative flex items-center justify-center">
        <div ref={videoRef} className="absolute inset-0" />
        {status !== 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#0E111E]">
            {status === 'joining' && <Loader2 className="animate-spin text-pink-400 mb-3" size={34} />}
            {status === 'audio' && <Mic className="text-cyan-300 mb-3" size={34} />}
            {status === 'empty' && <Video className="text-gray-500 mb-3" size={34} />}
            {status === 'error' && <ShieldAlert className="text-red-300 mb-3" size={34} />}
            <p className="text-white font-black">{message}</p>
            <p className="text-xs text-gray-500 mt-1">Admin joins Agora only as a subscriber.</p>
          </div>
        )}
      </div>
    </div>
  );
}
