"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  HeartPulse,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAccess } from '@/lib/adminAccess';

type JsonRecord = Record<string, unknown>;
type ControlAction = 'pause' | 'resume' | 'refund';

type CrashRound = {
  id: string;
  round_number?: number;
  phase: string;
  state_version?: number;
  betting_closes_at?: string;
  flight_started_at?: string;
  crashed_at?: string;
  settled_at?: string;
  crash_multiplier_bp?: number;
  seed_commitment?: string;
  revealed_seed?: string;
  algorithm_version?: string;
  real_players?: number;
  real_bets?: number;
  real_stake?: number;
  real_exposure?: number;
  real_payout?: number;
  wins?: number;
  losses?: number;
};

type Summary = {
  players?: number;
  bets?: number;
  stake?: number;
  exposure?: number;
  payout?: number;
  wins?: number;
  losses?: number;
};

type BotSummary = Summary & { enabled?: boolean };

type HealthSignal = {
  status: string;
  detail?: string;
  latency_ms?: number;
  backlog?: number;
  last_seen_at?: string;
};

type AuditEvent = {
  id?: string;
  action?: string;
  actor_name?: string;
  actor_id?: string;
  reason?: string;
  round_id?: string;
  created_at?: string;
  outcome?: string;
};

type OperationsPayload = {
  success: boolean;
  message?: string;
  engine?: { paused?: boolean; status?: string; updated_at?: string };
  current_round?: CrashRound | null;
  human_summary?: Summary;
  bot_summary?: BotSummary;
  recent_rounds?: CrashRound[];
  health?: Record<string, HealthSignal>;
  audit_events?: AuditEvent[];
  server_time?: string;
};

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown, fallback = '—') => typeof value === 'string' && value.trim() ? value : fallback;
const formatAmount = (value: unknown) => value === null || value === undefined
  ? '—'
  : Math.round(number(value)).toLocaleString();
const formatMultiplier = (value: unknown) => number(value) > 0 ? `${(number(value) / 100).toFixed(2)}x` : '—';
const formatTime = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseRound(value: unknown): CrashRound | null {
  const row = asRecord(value);
  const id = typeof row.id === 'string' ? row.id : typeof row.round_id === 'string' ? row.round_id : '';
  if (!id) return null;
  return {
    ...(row as unknown as CrashRound), id,
    phase: text(row.phase, text(row.status, 'SCHEDULED')),
    real_players: number(row.real_players ?? row.players) || undefined,
    real_bets: number(row.real_bets ?? row.bets) || undefined,
    real_stake: number(row.real_stake ?? row.stake ?? row.real_bet_total) || undefined,
    real_exposure: number(row.real_exposure ?? row.exposure) || undefined,
    real_payout: number(row.real_payout ?? row.payout ?? row.real_payout_total) || undefined,
  };
}

function parseSummary(value: unknown): Summary {
  return asRecord(value) as Summary;
}

function parseOperations(value: unknown): OperationsPayload {
  const root = asRecord(value);
  const healthRoot = asRecord(root.health);
  const health = Object.fromEntries(Object.entries(healthRoot).map(([key, raw]) => {
    const signal = asRecord(raw);
    const pending = number(signal.pending ?? signal.backlog ?? signal.stuckCommands);
    const derivedStatus = typeof signal.healthy === 'boolean' ? (signal.healthy ? 'healthy' : 'down')
      : typeof signal.reachable === 'boolean' ? (signal.reachable ? 'healthy' : 'down')
        : (key === 'outbox' || key === 'rpc') ? (pending > 0 ? 'degraded' : 'healthy')
          : typeof raw === 'string' ? raw : typeof raw === 'boolean' ? (raw ? 'healthy' : 'down') : 'unknown';
    return [key, {
      status: text(signal.status, derivedStatus),
      detail: typeof signal.detail === 'string' ? signal.detail : undefined,
      latency_ms: number(signal.latency_ms ?? signal.latencyMs) || undefined,
      backlog: pending || undefined,
      last_seen_at: typeof (signal.last_seen_at ?? signal.heartbeatAt) === 'string' ? String(signal.last_seen_at ?? signal.heartbeatAt) : undefined,
    }];
  }));
  return {
    success: root.success !== false,
    message: typeof root.message === 'string' ? root.message : undefined,
    engine: asRecord(root.engine) as OperationsPayload['engine'],
    current_round: parseRound(root.current_round),
    human_summary: parseSummary(root.human_summary),
    bot_summary: asRecord(root.bot_summary) as BotSummary,
    recent_rounds: Array.isArray(root.recent_rounds) ? root.recent_rounds.map(parseRound).filter((row): row is CrashRound => !!row) : [],
    health,
    audit_events: Array.isArray(root.audit_events) ? root.audit_events.map((value) => {
      const row = asRecord(value);
      return {
        ...(row as AuditEvent),
        actor_id: typeof row.actor_id === 'string' ? row.actor_id : typeof row.admin_id === 'string' ? row.admin_id : undefined,
        outcome: typeof row.outcome === 'string' ? row.outcome : typeof row.success === 'boolean' ? (row.success ? 'success' : 'failed') : undefined,
      };
    }) : [],
    server_time: typeof root.server_time === 'string' ? root.server_time : undefined,
  };
}

function phaseTone(phase: string) {
  if (phase === 'RUNNING') return 'border-green-500/30 bg-green-500/10 text-green-300';
  if (phase === 'BETTING_OPEN') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  if (phase === 'VOIDING' || phase === 'VOIDED') return 'border-red-500/30 bg-red-500/10 text-red-300';
  return 'border-white/10 bg-white/5 text-gray-300';
}

function healthTone(status: string) {
  const normalized = status.toLowerCase();
  if (['healthy', 'ok', 'up', 'connected', 'ready'].includes(normalized)) return 'text-green-300 border-green-500/20 bg-green-500/5';
  if (['degraded', 'warning', 'stale'].includes(normalized)) return 'text-amber-300 border-amber-500/20 bg-amber-500/5';
  return 'text-red-300 border-red-500/20 bg-red-500/5';
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="rounded-2xl border border-white/5 bg-[#1A1730] p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-white">{value}</p>
    {hint ? <p className="mt-1 text-[11px] text-gray-500">{hint}</p> : null}
  </div>;
}

function HashValue({ label, value }: { label: string; value?: string }) {
  const copy = async () => {
    if (value) await navigator.clipboard.writeText(value);
  };
  return <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>{value ? <button type="button" onClick={() => void copy()} className="text-gray-500 hover:text-white" aria-label={`Copy ${label}`}><Copy size={14} /></button> : null}</div>
    <p className="mt-2 truncate font-mono text-xs text-gray-300" title={value}>{value || 'Not available'}</p>
  </div>;
}

export default function CrashOperationsPage() {
  const { access, can } = useAdminAccess();
  const canManage = can('game_control', 'manage');
  const canEmergencyControl = access?.role === 'super_admin' && canManage;
  const [payload, setPayload] = useState<OperationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [action, setAction] = useState<ControlAction | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<{ message: string; auditId?: string } | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_get_crash_operations');
    if (rpcError) {
      setError(rpcError.message.includes('Could not find the function')
        ? 'Crash operations backend is not deployed yet. The page will become active after the admin RPC migration is applied.'
        : rpcError.message);
    } else {
      const next = parseOperations(data);
      setPayload(next);
      setError(next.success ? null : next.message || 'Crash operations snapshot was rejected.');
      setLastLoadedAt(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(true), 350);
    };
    const channel = supabase.channel(`crash-admin-operations-${crypto.randomUUID()}`);
    // The signal row contains only a revision and timestamp. Financial rows,
    // player identities and seed material remain inaccessible to Realtime.
    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'crash_admin_refresh_signals', filter: 'game_id=eq.crash',
    }, scheduleRefresh);
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') scheduleRefresh(); });
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(true); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(initial);
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const current = payload?.current_round || null;
  const humans = payload?.human_summary || {};
  const bots = payload?.bot_summary || {};
  const enginePaused = payload?.engine?.paused === true || payload?.engine?.status === 'paused';
  const requiredConfirmation = useMemo(() => {
    if (!action) return '';
    if (action === 'refund') return `REFUND ${current?.id || 'ROUND'}`;
    return `${action.toUpperCase()} CRASH`;
  }, [action, current?.id]);

  function openAction(next: ControlAction) {
    setAction(next);
    setReason('');
    setConfirmation('');
    setActionResult(null);
  }

  async function submitAction() {
    if (!action || !canEmergencyControl || reason.trim().length < 10 || confirmation !== requiredConfirmation) return;
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('admin_crash_control', {
      p_action: action,
      p_round_id: action === 'refund' ? current?.id || null : null,
      p_reason: reason.trim(),
      p_confirmation: confirmation,
    });
    setSubmitting(false);
    const response = asRecord(data);
    if (rpcError || response.success === false) {
      setActionResult({ message: text(response.message, rpcError?.message || 'Emergency action failed.') });
      return;
    }
    setActionResult({
      message: text(response.message, `${action} accepted.`),
      auditId: typeof response.audit_id === 'string' ? response.audit_id : undefined,
    });
    await load(true);
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-cyan-400" size={38} /></div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-white"><Activity className="text-cyan-400" /> Crash Operations</h1>
        <p className="mt-1 text-sm text-gray-500">Read-only round evidence, real financial exposure, separately disclosed simulations, health, and audited emergency actions.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${enginePaused ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-green-500/30 bg-green-500/10 text-green-300'}`}>{enginePaused ? 'Engine paused' : text(payload?.engine?.status, 'Engine active')}</div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-gray-300 disabled:opacity-50" aria-label="Refresh operations"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
      </div>
    </div>

    {error ? <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-200"><AlertTriangle className="shrink-0" /><div><p className="font-bold">Operations data unavailable</p><p className="mt-1 text-sm text-amber-200/75">{error}</p></div></div> : null}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Real players" value={formatAmount(humans.players ?? current?.real_players)} hint="Human accounts only" />
      <Metric label="Real bets" value={formatAmount(humans.bets ?? current?.real_bets)} hint="Wallet-backed wagers" />
      <Metric label="Real stake" value={formatAmount(humans.stake ?? current?.real_stake)} hint="Diamonds committed" />
      <Metric label="Real exposure" value={formatAmount(humans.exposure ?? current?.real_exposure)} hint="Maximum open liability" />
      <Metric label="Real payout" value={formatAmount(humans.payout ?? current?.real_payout)} hint="Settled human credits" />
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="glass-card space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-widest text-gray-500">Current authoritative round</p><h2 className="mt-1 font-mono text-lg font-black text-white">{current?.id || 'No active round'}</h2></div>
          <span className={`rounded-full border px-3 py-1 text-xs font-black ${phaseTone(current?.phase || 'SCHEDULED')}`}>{current?.phase || 'SCHEDULED'}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Round number" value={current?.round_number ?? '—'} />
          <Metric label="State version" value={current?.state_version ?? '—'} />
          <Metric label="Crash point" value={formatMultiplier(current?.crash_multiplier_bp)} hint="Hidden until CRASHED" />
          <Metric label="Server snapshot" value={payload?.server_time ? new Date(payload.server_time).toLocaleTimeString() : '—'} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <HashValue label="Pre-round seed commitment" value={current?.seed_commitment} />
          <HashValue label="Revealed server seed" value={current?.revealed_seed} />
        </div>
        <div className="grid gap-3 text-xs text-gray-400 sm:grid-cols-2 lg:grid-cols-4">
          <div><Clock3 className="mb-1 text-cyan-400" size={16} />Bet closes<br /><span className="text-gray-200">{formatTime(current?.betting_closes_at)}</span></div>
          <div><CirclePlay className="mb-1 text-green-400" size={16} />Flight starts<br /><span className="text-gray-200">{formatTime(current?.flight_started_at)}</span></div>
          <div><XCircle className="mb-1 text-red-400" size={16} />Crashed<br /><span className="text-gray-200">{formatTime(current?.crashed_at)}</span></div>
          <div><ShieldCheck className="mb-1 text-purple-400" size={16} />Algorithm<br /><span className="text-gray-200">{current?.algorithm_version || '—'}</span></div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
        <div className="flex items-center gap-2"><Bot className="text-purple-300" /><div><h2 className="font-black text-white">Simulated activity</h2><p className="text-xs text-gray-500">Always separate from real financial totals.</p></div></div>
        <div className={`rounded-xl border p-3 text-sm font-bold ${bots.enabled ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : 'border-green-500/20 bg-green-500/5 text-green-300'}`}>{bots.enabled ? 'BOT activity enabled — visibly label all simulated players.' : 'No simulated activity enabled.'}</div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Bot players" value={formatAmount(bots.players)} />
          <Metric label="Bot bets" value={formatAmount(bots.bets)} />
          <Metric label="Simulated stake" value={formatAmount(bots.stake)} />
          <Metric label="Wallet exposure" value="0" hint="Must always remain zero" />
        </div>
      </section>
    </div>

    <section className="glass-card p-5">
      <div className="mb-4 flex items-center gap-2"><HeartPulse className="text-cyan-400" /><div><h2 className="font-black text-white">Engine and delivery health</h2><p className="text-xs text-gray-500">Coordinator, socket, durable outbox, database, and RPC signals from the backend.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {['engine', 'socket', 'outbox', 'database', 'rpc'].map((key) => {
          const signal = payload?.health?.[key] || { status: 'unknown' };
          const Icon = key === 'socket' ? Wifi : key === 'database' ? Database : key === 'outbox' ? ExternalLink : key === 'rpc' ? Activity : HeartPulse;
          return <div key={key} className={`rounded-xl border p-4 ${healthTone(signal.status)}`}><div className="flex items-center justify-between"><Icon size={18} /><span className="text-[10px] font-black uppercase">{signal.status}</span></div><p className="mt-3 font-black capitalize text-white">{key}</p><p className="mt-1 text-xs opacity-75">{signal.detail || (signal.latency_ms !== undefined ? `${signal.latency_ms} ms` : signal.backlog !== undefined ? `${signal.backlog} pending` : 'No detail reported')}</p>{signal.last_seen_at ? <p className="mt-1 text-[10px] opacity-60">{formatTime(signal.last_seen_at)}</p> : null}</div>;
        })}
      </div>
    </section>

    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 p-5"><History className="text-cyan-400" /><div><h2 className="font-black text-white">Previous rounds</h2><p className="text-xs text-gray-500">Human wins/losses, real stake/exposure, and fairness evidence.</p></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase text-gray-500"><th className="p-4">Round</th><th>Phase</th><th className="text-right">Crash</th><th className="text-right">Players / bets</th><th className="text-right">Stake / payout</th><th className="text-right">Wins / losses</th><th>Commitment / reveal</th><th className="pr-4 text-right">Settled</th></tr></thead><tbody>
        {(payload?.recent_rounds || []).length === 0 ? <tr><td colSpan={8} className="p-12 text-center text-gray-500">No previous Crash rounds returned.</td></tr> : payload?.recent_rounds?.map((round) => <tr key={round.id} className="border-b border-white/5 text-gray-300"><td className="p-4"><p className="font-mono font-bold text-white">#{round.round_number ?? '—'}</p><p className="max-w-36 truncate font-mono text-[10px] text-gray-600">{round.id}</p></td><td><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${phaseTone(round.phase)}`}>{round.phase}</span></td><td className="text-right font-black text-amber-300">{formatMultiplier(round.crash_multiplier_bp)}</td><td className="text-right">{formatAmount(round.real_players)} / {formatAmount(round.real_bets)}</td><td className="text-right">{formatAmount(round.real_stake)} / <span className="text-green-300">{formatAmount(round.real_payout)}</span></td><td className="text-right"><span className="text-green-300">{formatAmount(round.wins)}</span> / <span className="text-red-300">{formatAmount(round.losses)}</span></td><td><p className="max-w-32 truncate font-mono text-[10px]" title={round.seed_commitment}>{round.seed_commitment || '—'}</p><p className={`max-w-32 truncate font-mono text-[10px] ${round.revealed_seed ? 'text-green-400' : 'text-amber-400'}`} title={round.revealed_seed}>{round.revealed_seed || 'Pending reveal'}</p></td><td className="pr-4 text-right text-xs text-gray-500">{formatTime(round.settled_at)}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><AlertTriangle className="shrink-0 text-red-400" /><div><h2 className="font-black text-white">Emergency controls</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-gray-400">These controls never choose or edit a crash point. Every request requires super-admin authority, a reason, typed confirmation, and a server audit entry.</p></div></div><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase text-gray-400">{canEmergencyControl ? 'Super admin armed' : 'Read only'}</span></div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={!canEmergencyControl || enginePaused} onClick={() => openAction('pause')} className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-300 disabled:opacity-35"><CirclePause size={17} /> Pause new rounds</button>
        <button type="button" disabled={!canEmergencyControl || !enginePaused} onClick={() => openAction('resume')} className="flex items-center gap-2 rounded-xl bg-green-500/15 px-4 py-2 text-sm font-bold text-green-300 disabled:opacity-35"><CirclePlay size={17} /> Resume engine</button>
        <button type="button" disabled={!canEmergencyControl || !current} onClick={() => openAction('refund')} className="flex items-center gap-2 rounded-xl bg-red-500/15 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-35"><RotateCcw size={17} /> Void & refund current round</button>
      </div>
    </section>

    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 p-5"><ShieldCheck className="text-purple-400" /><div><h2 className="font-black text-white">Recent control audit</h2><p className="text-xs text-gray-500">Server-recorded actions and reasons; records are read-only here.</p></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase text-gray-500"><th className="p-4">Time</th><th>Action</th><th>Actor</th><th>Round</th><th>Reason</th><th className="pr-4 text-right">Outcome / audit ID</th></tr></thead><tbody>
        {(payload?.audit_events || []).length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-gray-500">No Crash control actions returned.</td></tr> : payload?.audit_events?.map((event, index) => <tr key={event.id || `${event.created_at}-${index}`} className="border-b border-white/5 text-gray-300"><td className="p-4 text-xs text-gray-500">{formatTime(event.created_at)}</td><td className="font-black uppercase text-white">{event.action || '—'}</td><td>{event.actor_name || event.actor_id || '—'}</td><td className="max-w-32 truncate font-mono text-xs">{event.round_id || '—'}</td><td className="max-w-sm text-xs text-gray-400">{event.reason || '—'}</td><td className="pr-4 text-right"><p>{event.outcome || '—'}</p><p className="font-mono text-[10px] text-gray-600">{event.id || '—'}</p></td></tr>)}
      </tbody></table></div>
    </section>

    <p className="flex items-center justify-between text-[10px] text-gray-600"><span>Realtime-triggered refresh with manual and foreground recovery. Financial authority remains in the backend.</span><span>Last loaded {lastLoadedAt?.toLocaleTimeString() || '—'}</span></p>

    {action ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl border border-red-500/25 bg-[#191426] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-white capitalize">Confirm {action}</h2><p className="mt-1 text-sm text-gray-400">This request will be written to the immutable Crash control audit.</p></div><button type="button" onClick={() => setAction(null)} className="text-gray-500 hover:text-white"><XCircle /></button></div>
      <label className="mt-5 block text-xs font-bold uppercase text-gray-500">Operational reason (minimum 10 characters)<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm normal-case text-white outline-none focus:border-red-500" placeholder="Incident ticket, observed fault, and intended outcome" /></label>
      <label className="mt-4 block text-xs font-bold uppercase text-gray-500">Type <span className="font-mono text-red-300">{requiredConfirmation}</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-sm normal-case text-white outline-none focus:border-red-500" autoComplete="off" /></label>
      {actionResult ? <div className={`mt-4 rounded-xl border p-3 text-sm ${actionResult.auditId ? 'border-green-500/20 bg-green-500/10 text-green-200' : 'border-red-500/20 bg-red-500/10 text-red-200'}`}>{actionResult.auditId ? <CheckCircle2 className="mr-2 inline" size={17} /> : <XCircle className="mr-2 inline" size={17} />}{actionResult.message}{actionResult.auditId ? <p className="mt-1 font-mono text-[10px]">Audit ID: {actionResult.auditId}</p> : null}</div> : null}
      <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setAction(null)} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-400">Cancel</button><button type="button" onClick={() => void submitAction()} disabled={submitting || reason.trim().length < 10 || confirmation !== requiredConfirmation} className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-35">{submitting ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />} Submit audited action</button></div>
    </div></div> : null}
  </div>;
}
