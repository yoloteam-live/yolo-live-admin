"use client";
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Trophy, Search, Loader2, Gamepad2, TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react';

type RoundRow = {
  id: string;
  game_type: string;
  // user_id is NULLABLE since migration 51 — multiplayer/room-scoped
  // rounds don't belong to a single player. The render path handles
  // null by labelling the row as "Room round".
  user_id: string | null;
  bets: unknown;
  result: { winning_type?: string; winner_pos?: string } | null;
  total_bet: number;
  win_amount: number;
  created_at: string;
  user: { full_name: string; display_id: number; avatar_url: string | null } | null;
};

const ACTIVE_GAMES = ['greedy_lion', 'tin_patti_pro'] as const;
const GAMES = ['all', ...ACTIVE_GAMES] as const;
type GameKey = typeof GAMES[number];

export default function GameHistoryPage() {
  const [rows, setRows]     = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState<GameKey>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('game_rounds')
      .select(`
        *,
        user:profiles!game_rounds_user_id_fkey(full_name, display_id, avatar_url)
      `)
      .in('game_type', ACTIVE_GAMES)
      .order('created_at', { ascending: false })
      .limit(limit);
    setRows((data as RoundRow[]) || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchRounds(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchRounds]);

  const filtered = rows.filter((r) => {
    if (gameFilter !== 'all' && r.game_type !== gameFilter) return false;
    if (outcomeFilter === 'wins'   && (r.win_amount ?? 0) <= 0) return false;
    if (outcomeFilter === 'losses' && (r.win_amount ?? 0) >  0) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.user?.full_name?.toLowerCase().includes(s) ||
      String(r.user?.display_id ?? '').includes(s)
    );
  });

  // Aggregate strip
  const totalBet  = filtered.reduce((a, r) => a + (r.total_bet  || 0), 0);
  const totalWin  = filtered.reduce((a, r) => a + (r.win_amount || 0), 0);
  const houseEdge = totalBet - totalWin;
  const winRate   = filtered.length === 0 ? 0
    : Math.round((filtered.filter((r) => (r.win_amount ?? 0) > 0).length / filtered.length) * 100);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-pink-600 flex items-center justify-center">
            <Trophy className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Game History</h1>
            <p className="text-xs text-gray-500">Every round across every game — for audit and suspicion checks</p>
          </div>
        </div>
        <button
          onClick={fetchRounds}
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Aggregate strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Rounds" value={filtered.length.toLocaleString()} />
        <Stat label="Total bet"  value={`💎 ${totalBet.toLocaleString()}`} color="cyan" />
        <Stat label="Total paid" value={`💎 ${totalWin.toLocaleString()}`} color="green" />
        <Stat label="House edge" value={`💎 ${houseEdge.toLocaleString()}`} sub={`Win rate ${winRate}%`} color={houseEdge >= 0 ? 'amber' : 'red'} />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="Search user / display id…"
            className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1">
          {GAMES.map((g) => (
            <button
              key={g}
              onClick={() => setGameFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${gameFilter === g ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500 hover:text-white'}`}
            >
              {g === 'all' ? 'All' : g.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1">
          {(['all', 'wins', 'losses'] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOutcomeFilter(o)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${outcomeFilter === o ? 'bg-amber-500/20 text-amber-300' : 'text-gray-500 hover:text-white'}`}
            >
              {o}
            </button>
          ))}
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value))}
          className="bg-[#1E1A34] border border-[#251B45] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
        >
          <option value={100}>Last 100</option>
          <option value={500}>Last 500</option>
          <option value={2000}>Last 2000</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-amber-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <Gamepad2 className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No rounds match this filter.</p>
        </div>
      ) : (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Game</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-right">Bet</th>
                <th className="px-4 py-3 text-right">Win</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const net = (r.win_amount ?? 0) - (r.total_bet ?? 0);
                const isWin = (r.win_amount ?? 0) > 0;
                return (
                  <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        r.game_type === 'tin_patti_pro' ? 'bg-purple-500/15 text-purple-300' : 'bg-amber-500/15 text-amber-300'
                      }`}>{r.game_type.replaceAll('_',' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {/* Since migration 51, game_rounds.user_id is NULL on
                          multiplayer/room-shared rounds — only legacy
                          single-player rows still have a user. Render a
                          "Room round" pill instead of crashing on
                          null.slice(). */}
                      <p className="font-semibold">{r.user?.full_name ?? (r.user_id ? '—' : 'Room round')}</p>
                      <p className="text-[10px] text-gray-500">
                        ID {r.user?.display_id ?? (r.user_id ? r.user_id.slice(0, 8) : '—')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right text-cyan-300 font-mono">{(r.total_bet ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-300 font-mono">{(r.win_amount ?? 0).toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-mono ${net >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      <span className="inline-flex items-center gap-1">
                        {net >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {net >= 0 ? '+' : ''}{net.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <code className="text-[10px] text-gray-400 bg-black/30 rounded px-1.5 py-0.5">
                        {isWin ? '✓ Won' : '✗ Lost'} · {r.result?.winning_type ?? r.result?.winner_pos ?? '—'}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, color = 'gray' }: { label: string; value: string; sub?: string; color?: 'cyan' | 'green' | 'amber' | 'red' | 'gray' }) {
  const palette = {
    cyan:  'text-cyan-300',
    green: 'text-green-300',
    amber: 'text-amber-300',
    red:   'text-red-300',
    gray:  'text-white',
  }[color];
  return (
    <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-4">
      <p className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">{label}</p>
      <p className={`text-2xl font-black ${palette} mt-1`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
