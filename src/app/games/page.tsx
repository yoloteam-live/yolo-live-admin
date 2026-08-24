'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import {
  Gamepad2,
  Settings2,
  Save,
  RotateCcw,
  Trophy,
  AlertTriangle,
  Loader2,
  CheckCircle2
} from 'lucide-react';

type GameSetting = {
  id: string;
  is_active: boolean;
  win_chance_percent: number;
  min_bet?: number | null;
  max_bet?: number | null;
  daily_loss_cap?: number | null;
  multipliers?: unknown;
  round_duration_s?: number | null;
  result_display_s?: number | null;
  house_profile_id?: string | null;
  forced_next_category?: string | null;
  forced_next_result?: string | null;
  special_result_rules?: {
    pizza_enabled?: boolean;
    pizza_per_hour?: number;
    pizza_max_per_day?: number;
    salad_enabled?: boolean;
    salad_per_hour?: number;
    salad_max_per_day?: number;
    target_payout_min_percent?: number;
    target_payout_max_percent?: number;
    bet_acceptance_grace_s?: number;
    dice_animation_s?: number;
    house_edge_bps?: number;
    max_multiplier_bp?: number;
    betting_seconds?: number;
    growth_rate?: number;
    max_players?: number;
    auto_cashout_min_bp?: number;
    auto_cashout_max_bp?: number;
    max_round_liability?: number;
    bot_enabled?: boolean;
    bot_count_min?: number;
    bot_count_max?: number;
    bot_bet_min?: number;
    bot_bet_max?: number;
    bot_cashout_min_bp?: number;
    bot_cashout_max_bp?: number;
    bot_activity_min_ms?: number;
    bot_activity_max_ms?: number;
  } | null;
  _houseDisplayId?: string;
  _multipliersText?: string;
};

type CrashAdminConfig = {
  game_id: string; table_id: string; is_active: boolean; maintenance: boolean;
  betting_duration_ms: number; result_duration_ms: number; growth_rate: number;
  house_edge_bps: number; max_crash_multiplier_bp: number;
  min_bet: number; max_bet: number; max_players: number;
  auto_cashout_min_bp: number; auto_cashout_max_bp: number;
  max_round_liability: number; daily_loss_cap: number | null; house_profile_id: string | null;
  bot_enabled: boolean; bot_count_min: number; bot_count_max: number;
  bot_bet_min: number; bot_bet_max: number; bot_cashout_min_bp: number; bot_cashout_max_bp: number;
  bot_activity_min_ms: number; bot_activity_max_ms: number;
};

type HouseProfile = {
  id: string;
  full_name?: string | null;
  display_id?: number | null;
  diamonds?: number | null;
};

const GREEDY_LION_ITEMS = [
  { id: 'corn', label: 'Corn' },
  { id: 'chicken', label: 'Chicken' },
  { id: 'shrimp', label: 'Shrimp' },
  { id: 'tomato', label: 'Tomato' },
  { id: 'ham', label: 'Ham' },
  { id: 'pepper', label: 'Pepper' },
  { id: 'fish', label: 'Fish' },
  { id: 'carrot', label: 'Carrot' },
];

const TIN_PATTI_PRO_ITEMS = [
  { id: 'crown', label: 'Crown' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'cake', label: 'Cake' },
];

const LUCKY_DICE_ITEMS = [
  { id: 'small', label: 'Small (4-10)', multiplier: 2 },
  { id: 'big', label: 'Big (11-17)', multiplier: 2 },
  { id: 'odd', label: 'Odd (no triple)', multiplier: 2 },
  { id: 'even', label: 'Even (no triple)', multiplier: 2 },
  { id: 'any_triple', label: 'Any Triple', multiplier: 31 },
  { id: 'total_6', label: 'Total 6', multiplier: 15 },
  { id: 'total_9', label: 'Total 9', multiplier: 7 },
  { id: 'total_12', label: 'Total 12', multiplier: 7 },
  { id: 'total_15', label: 'Total 15', multiplier: 15 },
];

const GLOBAL_PAYOUT_GAME_IDS = new Set(['greedy_lion', 'greedy_pro', 'tin_patti_pro']);
const MANAGED_ROUND_GAME_IDS = new Set(['greedy_lion', 'greedy_pro', 'tin_patti_pro', 'lucky_dice', 'crash']);
const APP_GAME_IDS = ['greedy_lion', 'greedy_pro', 'tin_patti_pro', 'lucky_dice', 'crash'];

const DEFAULT_GLOBAL_RULES = {
  pizza_enabled: true,
  pizza_per_hour: 0,
  pizza_max_per_day: 0,
  salad_enabled: true,
  salad_per_hour: 0,
  salad_max_per_day: 0,
  target_payout_min_percent: 30,
  target_payout_max_percent: 40,
};

function isGlobalPayoutGame(id: string) {
  return GLOBAL_PAYOUT_GAME_IDS.has(id);
}

function isManagedRoundGame(id: string) {
  return MANAGED_ROUND_GAME_IDS.has(id);
}

function isGreedyGame(id: string) {
  return id === 'greedy_lion' || id === 'greedy_pro';
}

function isCrashGame(id: string) {
  return id === 'crash';
}

function globalRules(game: GameSetting) {
  return { ...DEFAULT_GLOBAL_RULES, ...(game.special_result_rules || {}) };
}

function forcedResultItems(gameId: string) {
  if (gameId === 'tin_patti_pro') return TIN_PATTI_PRO_ITEMS;
  if (gameId === 'lucky_dice') return LUCKY_DICE_ITEMS;
  return GREEDY_LION_ITEMS;
}

function specialRules(game: GameSetting) {
  return game.special_result_rules || {};
}

function crashSetting(config: CrashAdminConfig, existing?: GameSetting): GameSetting {
  return {
    ...(existing || { id: 'crash', win_chance_percent: 0, multipliers: null }),
    id: 'crash', is_active: config.is_active, min_bet: config.min_bet, max_bet: config.max_bet,
    daily_loss_cap: config.daily_loss_cap, round_duration_s: config.betting_duration_ms / 1000,
    result_display_s: config.result_duration_ms / 1000, house_profile_id: config.house_profile_id,
    special_result_rules: {
      ...(existing?.special_result_rules || {}), betting_seconds: config.betting_duration_ms / 1000,
      growth_rate: config.growth_rate, house_edge_bps: config.house_edge_bps,
      max_multiplier_bp: config.max_crash_multiplier_bp, max_players: config.max_players,
      auto_cashout_min_bp: config.auto_cashout_min_bp, auto_cashout_max_bp: config.auto_cashout_max_bp,
      max_round_liability: config.max_round_liability, bot_enabled: config.bot_enabled,
      bot_count_min: config.bot_count_min, bot_count_max: config.bot_count_max,
      bot_bet_min: config.bot_bet_min, bot_bet_max: config.bot_bet_max,
      bot_cashout_min_bp: config.bot_cashout_min_bp, bot_cashout_max_bp: config.bot_cashout_max_bp,
      bot_activity_min_ms: config.bot_activity_min_ms, bot_activity_max_ms: config.bot_activity_max_ms,
    },
  };
}

function multiplierRows(game: GameSetting): Array<Record<string, unknown>> {
  const fallback: Array<Record<string, unknown>> = game.id === 'lucky_dice'
    ? LUCKY_DICE_ITEMS.map((item) => ({ id: item.id, label: item.label, m: item.multiplier }))
    : [];
  const value = game.multipliers;
  return Array.isArray(value) && value.length > 0 ? value as Array<Record<string, unknown>> : fallback;
}

export default function GameControlPage() {
  // Super-admin only. Managers who paste the URL get bounced.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<GameSetting[]>([]);
  const [houseProfiles, setHouseProfiles] = useState<Record<string, HouseProfile>>({});
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchSettings();
  }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function fetchSettings() {
    setLoading(true);
    const [{ data, error }, crashResult] = await Promise.all([
      supabase.from('game_settings').select('*').in('id', APP_GAME_IDS),
      supabase.from('crash_game_configs').select('*').eq('game_id', 'crash').eq('table_id', 'global').maybeSingle(),
    ]);
    
    if (error) {
      console.error("Supabase Error:", error);
    }
    if (data) {
      const rows = [...data] as GameSetting[];
      if (crashResult.data) {
        const current = rows.find((row) => row.id === 'crash');
        const merged = crashSetting(crashResult.data as CrashAdminConfig, current);
        const index = rows.findIndex((row) => row.id === 'crash');
        if (index >= 0) rows[index] = merged;
        else rows.push(merged);
      }
      setSettings(rows.sort((a, b) => APP_GAME_IDS.indexOf(a.id) - APP_GAME_IDS.indexOf(b.id)));
      const houseIds = rows
        .map((row: GameSetting) => row.house_profile_id)
        .filter((id): id is string => !!id);
      if (houseIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, display_id, diamonds')
          .in('id', houseIds);
        setHouseProfiles(Object.fromEntries((profiles || []).map((profile: HouseProfile) => [profile.id, profile])));
      } else {
        setHouseProfiles({});
      }
    }
    setLoading(false);
  }

  async function updateCrashConfig(patch: Record<string, unknown>) {
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_update_crash_config', { p_patch: patch });
    setSaving(false);
    if (error || data?.success === false) {
      alert(data?.message || error?.message || 'Crash config update failed.');
      return false;
    }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    await fetchSettings();
    return true;
  }

  async function updateSetting(id: string, winChance: number, isActive: boolean) {
    if (isCrashGame(id)) {
      await updateCrashConfig({ is_active: isActive });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('game_settings')
      .update({
        win_chance_percent: winChance,
        is_active: isActive
      })
      .eq('id', id);

    if (!error) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchSettings();
    }
    setSaving(false);
  }

  // Save the bet-limit + multiplier block for a single game. The
  // Multipliers are stored as JSONB, so the admin can edit the supported
  // game's server-driven payout definitions without a dashboard rebuild.
  async function saveLimits(game: GameSetting) {
    if (isCrashGame(game.id)) {
      const rules = specialRules(game);
      let houseProfileId = game.house_profile_id || null;
      const displayId = String(game._houseDisplayId ?? houseProfiles[houseProfileId || '']?.display_id ?? '').trim();
      if (!houseProfileId && displayId) {
        const parsedDisplayId = Number(displayId);
        if (!Number.isInteger(parsedDisplayId)) { alert('Crash house user id must be numeric.'); return; }
        const { data: owner, error: ownerError } = await supabase.from('profiles').select('id, full_name, display_id, diamonds').eq('display_id', parsedDisplayId).maybeSingle();
        if (ownerError || !owner?.id) { alert(`No user found for house id ${displayId}.`); return; }
        houseProfileId = owner.id;
      }
      const crashPatch = {
        is_active: game.is_active,
        betting_duration_ms: Math.round(Number(rules.betting_seconds ?? game.round_duration_s ?? 8) * 1000),
        result_duration_ms: Math.round(Number(game.result_display_s ?? 5) * 1000),
        growth_rate: Number(rules.growth_rate ?? 0.08),
        house_edge_bps: Number(rules.house_edge_bps ?? 100),
        max_crash_multiplier_bp: Number(rules.max_multiplier_bp ?? 100000),
        min_bet: Number(game.min_bet ?? 100), max_bet: Number(game.max_bet ?? 100000),
        max_players: Number(rules.max_players ?? 10000),
        auto_cashout_min_bp: Number(rules.auto_cashout_min_bp ?? 101),
        auto_cashout_max_bp: Number(rules.auto_cashout_max_bp ?? 100000),
        max_round_liability: Number(rules.max_round_liability ?? 100000000),
        daily_loss_cap: game.daily_loss_cap ?? null, house_profile_id: houseProfileId,
        bot_enabled: Boolean(rules.bot_enabled), bot_count_min: Number(rules.bot_count_min ?? 0),
        bot_count_max: Number(rules.bot_count_max ?? 0), bot_bet_min: Number(rules.bot_bet_min ?? 500),
        bot_bet_max: Number(rules.bot_bet_max ?? 50000), bot_cashout_min_bp: Number(rules.bot_cashout_min_bp ?? 105),
        bot_cashout_max_bp: Number(rules.bot_cashout_max_bp ?? 805), bot_activity_min_ms: Number(rules.bot_activity_min_ms ?? 250),
        bot_activity_max_ms: Number(rules.bot_activity_max_ms ?? 7500),
      };
      if (!houseProfileId) { alert('Choose a funded Crash house profile before saving.'); return; }
      if (crashPatch.min_bet <= 0 || crashPatch.max_bet < crashPatch.min_bet) { alert('Crash maximum bet must be at least the minimum bet.'); return; }
      if (crashPatch.auto_cashout_min_bp < 101 || crashPatch.auto_cashout_max_bp < crashPatch.auto_cashout_min_bp || crashPatch.auto_cashout_max_bp > crashPatch.max_crash_multiplier_bp) { alert('Crash auto-cashout bounds are invalid.'); return; }
      if (crashPatch.bot_count_max < crashPatch.bot_count_min || crashPatch.bot_bet_max < crashPatch.bot_bet_min || crashPatch.bot_cashout_max_bp < crashPatch.bot_cashout_min_bp || crashPatch.bot_activity_max_ms < crashPatch.bot_activity_min_ms) { alert('Crash bot ranges are invalid.'); return; }
      await updateCrashConfig(crashPatch);
      return;
    }
    let parsedMultipliers: unknown = null;
    try {
      parsedMultipliers = JSON.parse(game._multipliersText ?? JSON.stringify(game.multipliers ?? null));
    } catch {
      alert('Multipliers field must be valid JSON.');
      return;
    }
    if (isManagedRoundGame(game.id) && !isCrashGame(game.id) && !game.house_profile_id) {
      const displayId = String(game._houseDisplayId ?? '').trim();
      if (!displayId) {
        alert(`${gameDisplayName(game.id)} needs a payout-owner user id before saving.`);
        return;
      }
      const parsedDisplayId = Number(displayId);
      if (!Number.isInteger(parsedDisplayId)) {
        alert('Payout-owner user id must be a number like 202601.');
        return;
      }
      const { data: owner, error: ownerError } = await supabase
        .from('profiles')
        .select('id, full_name, display_id, diamonds')
        .eq('display_id', parsedDisplayId)
        .maybeSingle();
      if (ownerError || !owner?.id) {
        alert('No user found for payout-owner user id ' + displayId);
        return;
      }
      game.house_profile_id = owner.id;
      setHouseProfiles((current) => ({ ...current, [owner.id]: owner as HouseProfile }));
    }
    if (isManagedRoundGame(game.id)) {
      const duration = Number(game.round_duration_s ?? 30);
      const display = Number(game.result_display_s ?? 15);
      if (!duration || duration < 5) {
        alert('Round duration must be at least 5 seconds.');
        return;
      }
      if (!display || display < 3) {
        alert('Result popup duration must be at least 3 seconds.');
        return;
      }
      if (isGlobalPayoutGame(game.id)) {
        const rules = globalRules(game);
        const minPayout = Number(rules.target_payout_min_percent ?? 30);
        const maxPayout = Number(rules.target_payout_max_percent ?? 40);
        if (minPayout < 0 || maxPayout < minPayout) {
          alert(`${gameDisplayName(game.id)} payout range must be 0 or higher, and max must be greater than or equal to min.`);
          return;
        }
      }
      if (isCrashGame(game.id)) {
        const rules = specialRules(game);
        const edge = Number(rules.house_edge_bps ?? 100);
        const maxMultiplier = Number(rules.max_multiplier_bp ?? 1_000_000);
        if (!Number.isInteger(edge) || edge < 0 || edge > 10_000) {
          alert('Crash house edge must be between 0 and 10,000 basis points.');
          return;
        }
        if (!Number.isInteger(maxMultiplier) || maxMultiplier < 100) {
          alert('Crash maximum multiplier must be at least 100 basis points (1.00x).');
          return;
        }
      }
    }
    const patch: Partial<GameSetting> = {
      win_chance_percent: game.win_chance_percent,
      is_active:       game.is_active,
      min_bet:        game.min_bet ?? 10,
      // max_bet NULL = uncapped (the place_game_bet RPC skips the
      // per-round check when this is null). Don't coerce blank → 100k.
      max_bet:        game.max_bet ?? null,
      daily_loss_cap: game.daily_loss_cap || null,
      multipliers:    parsedMultipliers,
    };
    if (isManagedRoundGame(game.id)) {
      patch.round_duration_s = Number(game.round_duration_s ?? 30);
      patch.result_display_s = Number(game.result_display_s ?? 15);
      if (isCrashGame(game.id)) {
        patch.special_result_rules = specialRules(game);
      } else {
        patch.house_profile_id = game.house_profile_id;
        patch.forced_next_category = isGreedyGame(game.id) && ['pizza', 'salad'].includes(game.forced_next_result || '') ? game.forced_next_result : null;
        patch.forced_next_result = game.forced_next_result || null;
        patch.special_result_rules = game.id === 'lucky_dice' ? specialRules(game) : globalRules(game);
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from('game_settings')
      .update(patch)
      .eq('id', game.id);
    setSaving(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    fetchSettings();
  }

  function gameDisplayName(id: string) {
    if (id === 'greedy_lion') return 'Popular Greedy';
    if (id === 'greedy_pro') return 'Greedy King';
    if (id === 'tin_patti_pro') return 'Tin Patti Pro';
    if (id === 'lucky_dice') return 'Lucky Dice Royale';
    if (id === 'crash') return 'Crash';
    if (id === 'royal_feast') return 'Royal Feast';
    return id.replaceAll('_', ' ');
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0E111E]">
        <Loader2 className="animate-spin text-pink-500 mb-4" size={40} />
        <p className="text-gray-400 font-medium">Loading Game Control Panel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E111E] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-white mb-2 flex items-center gap-3">
              <Gamepad2 className="text-pink-500" size={36} />
              Game Control Center
            </h1>
            <p className="text-gray-500 text-sm md:text-base font-medium">
              Manage win probabilities and system logic for all games.
            </p>
          </div>
          {success && (
            <div className="bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-xl flex items-center gap-2 text-green-400 animate-bounce">
              <CheckCircle2 size={18} />
              <span className="text-sm font-bold">Settings Saved!</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {settings.map((game) => (
          <div key={game.id} className="bg-[#1A1230] border border-white/5 rounded-[32px] p-8 shadow-2xl overflow-hidden relative">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 blur-3xl rounded-full -mr-16 -mt-16" />
            
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20">
                  <Trophy className="text-white" size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white capitalize">{gameDisplayName(game.id)}</h2>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${game.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      {game.is_active ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={game.is_active}
                  onChange={(e) => updateSetting(game.id, game.win_chance_percent, e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
              </label>
            </div>

            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 size={14} className="text-pink-500" />
                    {isGlobalPayoutGame(game.id) ? 'Target Payout Range' : game.id === 'lucky_dice' ? 'Result Model' : isCrashGame(game.id) ? 'Fairness Model' : 'Win Probability (RTP)'}
                  </label>
                  <span className="text-2xl font-black text-pink-500">
                    {isGlobalPayoutGame(game.id)
                      ? `${globalRules(game).target_payout_min_percent}-${globalRules(game).target_payout_max_percent}%`
                      : game.id === 'lucky_dice' ? 'SERVER RNG'
                      : isCrashGame(game.id) ? 'COMMIT / REVEAL'
                      : `${game.win_chance_percent}%`}
                  </span>
                </div>
                
                {isGlobalPayoutGame(game.id) ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Minimum payout %</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                        value={Number(globalRules(game).target_payout_min_percent ?? 30)}
                        onChange={(e) => {
                          const rules = globalRules(game);
                          const min = Math.max(0, parseInt(e.target.value) || 0);
                          const max = Math.max(min, Number(rules.target_payout_max_percent ?? min));
                          const nextRules = { ...rules, target_payout_min_percent: min, target_payout_max_percent: max };
                          setSettings(settings.map((s) => s.id === game.id ? { ...s, win_chance_percent: min, special_result_rules: nextRules } : s));
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Maximum payout %</label>
                      <input
                        type="number"
                        min={0}
                        className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                        value={Number(globalRules(game).target_payout_max_percent ?? 40)}
                        onChange={(e) => {
                          const rules = globalRules(game);
                          const min = Number(rules.target_payout_min_percent ?? 0);
                          const max = Math.max(min, parseInt(e.target.value) || 0);
                          const nextRules = { ...rules, target_payout_max_percent: max };
                          setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: nextRules } : s));
                        }}
                      />
                    </div>
                  </div>
                ) : game.id === 'lucky_dice' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#0E111E] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase font-bold">Dice</p><p className="text-white font-black">3</p></div>
                    <div className="bg-[#0E111E] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase font-bold">Faces</p><p className="text-white font-black">6</p></div>
                    <div className="bg-[#0E111E] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase font-bold">Authority</p><p className="text-green-300 font-black">Server</p></div>
                  </div>
                ) : isCrashGame(game.id) ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#0E111E] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase font-bold">Commit</p><p className="text-cyan-300 font-black">Before bets</p></div>
                    <div className="bg-[#0E111E] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase font-bold">Result</p><p className="text-white font-black">Server only</p></div>
                    <div className="bg-[#0E111E] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500 uppercase font-bold">Reveal</p><p className="text-green-300 font-black">After round</p></div>
                  </div>
                ) : (
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    className="w-full h-3 bg-[#0E111E] rounded-lg appearance-none cursor-pointer accent-pink-500"
                    value={game.win_chance_percent}
                    onChange={(e) => {
                      const newSettings = settings.map(s => s.id === game.id ? { ...s, win_chance_percent: parseInt(e.target.value) } : s);
                      setSettings(newSettings);
                    }}
                  />
                )}
                
                <div className="flex justify-between mt-4">
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
                    {isGlobalPayoutGame(game.id) ? 'Lower Payout' : game.id === 'lucky_dice' ? 'Fixed payout table' : isCrashGame(game.id) ? 'Immutable commitment' : 'Greedy (Admin Wins)'}
                  </span>
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">
                    {isGlobalPayoutGame(game.id) ? 'Higher Payout' : game.id === 'lucky_dice' ? 'Authoritative roll' : isCrashGame(game.id) ? 'Public verification' : 'Giving (User Wins)'}
                  </span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex gap-4 items-start">
                <AlertTriangle className="text-yellow-500 shrink-0" size={20} />
                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                  {isGlobalPayoutGame(game.id)
                    ? 'Target Payout Range chooses an exact item inside the min/max payout range. If no item is inside the range, it chooses the closest non-zero item below the minimum and avoids going above the maximum.'
                    : game.id === 'lucky_dice'
                      ? 'The backend rolls three dice, derives every winning zone, and settles all matching bets atomically. The client never chooses the dice or payout.'
                    : isCrashGame(game.id)
                      ? 'Crash results are committed before betting and revealed after settlement. This panel cannot force, replace, or recalculate a result.'
                    : <>Lowering the probability increases the house edge (profit), while raising it makes users win more often. Factory default is <span className="text-white">30%</span>.</>}
                </p>
              </div>

              <button
                disabled={saving}
                onClick={() => isManagedRoundGame(game.id) ? saveLimits(game) : updateSetting(game.id, game.win_chance_percent, game.is_active)}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] active:scale-[0.98] transition-all text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-pink-500/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> Save Game Config</>}
              </button>

              {/* Bet limits + multiplier block — drives the RPC's server-side enforcement */}
              <div className="border-t border-white/5 pt-6 mt-6 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bet limits & multipliers</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Min bet</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                      value={game.min_bet ?? 10}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        setSettings(settings.map((s) => s.id === game.id ? { ...s, min_bet: v } : s));
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Max bet (per round)</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="empty = no cap"
                      className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                      value={game.max_bet ?? ''}
                      onChange={(e) => {
                        // Blank field → null → uncapped. Otherwise a parsed
                        // positive integer. Matches the daily-loss-cap field
                        // pattern below so admins see both as "empty=no cap".
                        const raw = e.target.value;
                        const v = raw === '' ? null : (parseInt(raw) || 0);
                        setSettings(settings.map((s) => s.id === game.id ? { ...s, max_bet: v } : s));
                      }}
                    />
                    <p className="text-[10px] text-gray-600 mt-1">Cumulative bet limit per user per round.</p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Daily loss cap (per user)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="empty = no cap"
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                    value={game.daily_loss_cap ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === '' ? null : (parseInt(raw) || 0);
                      setSettings(settings.map((s) => s.id === game.id ? { ...s, daily_loss_cap: v } : s));
                    }}
                  />
                  <p className="text-[10px] text-gray-600 mt-1">
                    Per-user limit on net losses (diamonds) over 24 hours.
                  </p>
                </div>

                {isManagedRoundGame(game.id) && (
                  <div className="space-y-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">Round duration seconds</label>
                        <input
                          type="number"
                          min={5}
                          className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                          value={game.round_duration_s ?? 30}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 30;
                            setSettings(settings.map((s) => s.id === game.id ? { ...s, round_duration_s: v } : s));
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">Result popup seconds</label>
                        <input
                          type="number"
                          min={3}
                          className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                          value={game.result_display_s ?? 15}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 15;
                            setSettings(settings.map((s) => s.id === game.id ? { ...s, result_display_s: v } : s));
                          }}
                        />
                      </div>
                    </div>

                    {game.id === 'lucky_dice' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase text-gray-500 font-bold">Last-bet grace seconds</label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                            value={Number(specialRules(game).bet_acceptance_grace_s ?? 3)}
                            onChange={(e) => {
                              const rules = specialRules(game);
                              const value = Math.max(0, Math.min(10, parseInt(e.target.value) || 0));
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, bet_acceptance_grace_s: value } } : s));
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-gray-500 font-bold">Dice animation seconds</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                            value={Number(specialRules(game).dice_animation_s ?? 3)}
                            onChange={(e) => {
                              const rules = specialRules(game);
                              const value = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, dice_animation_s: value } } : s));
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {isCrashGame(game.id) && (
                      <div className="space-y-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Betting window seconds</label>
                            <input
                              type="number"
                              min={5}
                              max={300}
                              className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                              value={Number(specialRules(game).betting_seconds ?? game.round_duration_s ?? 15)}
                              onChange={(e) => {
                                const rules = specialRules(game);
                                const value = Math.max(5, Math.min(300, parseInt(e.target.value) || 5));
                                setSettings(settings.map((s) => s.id === game.id ? { ...s, round_duration_s: value, special_result_rules: { ...rules, betting_seconds: value } } : s));
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">House edge (basis points)</label>
                            <input
                              type="number"
                              min={0}
                              max={10000}
                              className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                              value={Number(specialRules(game).house_edge_bps ?? 100)}
                              onChange={(e) => {
                                const rules = specialRules(game);
                                const value = Math.max(0, Math.min(10000, parseInt(e.target.value) || 0));
                                setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, house_edge_bps: value } } : s));
                              }}
                            />
                            <p className="mt-1 text-[10px] text-gray-600">100 bp = 1.00%. Applies only to future seed commitments.</p>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Maximum multiplier (basis points)</label>
                            <input
                              type="number"
                              min={100}
                              className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                              value={Number(specialRules(game).max_multiplier_bp ?? 1_000_000)}
                              onChange={(e) => {
                                const rules = specialRules(game);
                                const value = Math.max(100, parseInt(e.target.value) || 100);
                                setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, max_multiplier_bp: value } } : s));
                              }}
                            />
                            <p className="mt-1 text-[10px] text-gray-600">100 bp = 1.00x. Never edits a committed round.</p>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Growth rate</label>
                            <input type="number" min={0.001} step={0.001} className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" value={Number(specialRules(game).growth_rate ?? 0.08)} onChange={(e) => {
                              const rules = specialRules(game);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, growth_rate: Number(e.target.value) } } : s));
                            }} />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Maximum real players</label>
                            <input type="number" min={1} className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" value={Number(specialRules(game).max_players ?? 10000)} onChange={(e) => {
                              const rules = specialRules(game);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, max_players: Math.max(1, parseInt(e.target.value) || 1) } } : s));
                            }} />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Auto-cashout minimum (bp)</label>
                            <input type="number" min={101} className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" value={Number(specialRules(game).auto_cashout_min_bp ?? 101)} onChange={(e) => {
                              const rules = specialRules(game);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, auto_cashout_min_bp: parseInt(e.target.value) || 101 } } : s));
                            }} />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Auto-cashout maximum (bp)</label>
                            <input type="number" min={101} className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" value={Number(specialRules(game).auto_cashout_max_bp ?? 100000)} onChange={(e) => {
                              const rules = specialRules(game);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, auto_cashout_max_bp: parseInt(e.target.value) || 101 } } : s));
                            }} />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-gray-500 font-bold">Maximum round liability</label>
                            <input type="number" min={1} className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" value={Number(specialRules(game).max_round_liability ?? 100000000)} onChange={(e) => {
                              const rules = specialRules(game);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, max_round_liability: parseInt(e.target.value) || 1 } } : s));
                            }} />
                          </div>
                          <div className="md:col-span-2 xl:col-span-3">
                            <label className="text-[10px] uppercase text-gray-500 font-bold">House profile user ID</label>
                            <input type="text" inputMode="numeric" className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" value={game._houseDisplayId ?? houseProfiles[game.house_profile_id || '']?.display_id ?? ''} onChange={(e) => setSettings(settings.map((s) => s.id === game.id ? { ...s, house_profile_id: null, _houseDisplayId: e.target.value } : s))} placeholder="Funded payout-owner user ID" />
                            {game.house_profile_id && houseProfiles[game.house_profile_id] ? <p className="mt-1 text-[10px] text-cyan-200">{houseProfiles[game.house_profile_id].full_name || 'House'} · {Math.round(Number(houseProfiles[game.house_profile_id].diamonds || 0)).toLocaleString()} diamonds</p> : <p className="mt-1 text-[10px] text-gray-600">Required. Backend validates the funded house profile.</p>}
                          </div>
                        </div>
                        <div className="space-y-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                          <label className="flex items-center justify-between gap-3"><span><span className="block text-xs font-black text-purple-200">Simulated bot activity</span><span className="block text-[10px] text-gray-500">Bots remain separate from real players, stake, exposure, and wallet balances.</span></span><input type="checkbox" checked={Boolean(specialRules(game).bot_enabled)} onChange={(e) => {
                            const rules = specialRules(game);
                            setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, bot_enabled: e.target.checked } } : s));
                          }} /></label>
                          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {([
                              ['Bot count min', 'bot_count_min', 0], ['Bot count max', 'bot_count_max', 0],
                              ['Bot bet min', 'bot_bet_min', 500], ['Bot bet max', 'bot_bet_max', 50000],
                              ['Cashout min (bp)', 'bot_cashout_min_bp', 105], ['Cashout max (bp)', 'bot_cashout_max_bp', 805],
                              ['Activity min (ms)', 'bot_activity_min_ms', 250], ['Activity max (ms)', 'bot_activity_max_ms', 7500],
                            ] as const).map(([label, key, fallback]) => <div key={key}><label className="text-[10px] uppercase text-gray-500 font-bold">{label}</label><input type="number" min={0} className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" value={Number(specialRules(game)[key] ?? fallback)} onChange={(e) => {
                              const rules = specialRules(game);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: { ...rules, [key]: parseInt(e.target.value) || 0 } } : s));
                            }} /></div>)}
                          </div>
                        </div>
                        <p className="text-xs font-bold text-cyan-200">Outcome controls are intentionally unavailable. Pause, resume, refunds, fairness evidence, and engine health live in Crash Operations.</p>
                      </div>
                    )}

                    {!isCrashGame(game.id) && (<>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="text-[10px] uppercase text-gray-500 font-bold">Force next result</label>
                        <select
                          className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                          value={game.forced_next_result ?? game.forced_next_category ?? ''}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            setSettings(settings.map((s) => s.id === game.id ? { ...s, forced_next_result: v, forced_next_category: ['pizza', 'salad'].includes(v || '') ? v : null } : s));
                          }}
                        >
                          <option value="">Clear</option>
                          {isGreedyGame(game.id) && <option value="pizza">Pizza</option>}
                          {isGreedyGame(game.id) && <option value="salad">Salad</option>}
                          {forcedResultItems(game.id).map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {isGreedyGame(game.id) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(['pizza', 'salad'] as const).map((category) => {
                        const rules = globalRules(game);
                        const title = category === 'pizza' ? 'Pizza category' : 'Salad category';
                        return (
                          <div key={category} className="bg-[#0E111E] border border-white/10 rounded-xl p-3 space-y-3">
                            <label className="flex items-center justify-between gap-3">
                              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{title}</span>
                              <input
                                type="checkbox"
                                checked={Boolean(rules[`${category}_enabled`])}
                                onChange={(e) => {
                                  const nextRules = { ...rules, [`${category}_enabled`]: e.target.checked };
                                  setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: nextRules } : s));
                                }}
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] uppercase text-gray-500 font-bold">Per hour</label>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full bg-[#080815] border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                                  value={Number(rules[`${category}_per_hour`] ?? 0)}
                                  onChange={(e) => {
                                    const nextRules = { ...rules, [`${category}_per_hour`]: Math.max(0, parseInt(e.target.value) || 0) };
                                    setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: nextRules } : s));
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase text-gray-500 font-bold">Max / day</label>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full bg-[#080815] border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                                  value={Number(rules[`${category}_max_per_day`] ?? 0)}
                                  onChange={(e) => {
                                    const nextRules = { ...rules, [`${category}_max_per_day`]: Math.max(0, parseInt(e.target.value) || 0) };
                                    setSettings(settings.map((s) => s.id === game.id ? { ...s, special_result_rules: nextRules } : s));
                                  }}
                                />
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-600">0 means no scheduled category wins for that limit.</p>
                          </div>
                        );
                      })}
                    </div>
                    )}

                    <div>
                      <label className="text-[10px] uppercase text-gray-500 font-bold">Payout-owner user id</label>
                      <input
                        type="text"
                        placeholder="Example: 202601"
                        className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-pink-500"
                        value={game._houseDisplayId ?? houseProfiles[game.house_profile_id || '']?.display_id ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim() || null;
                          setSettings(settings.map((s) => s.id === game.id ? { ...s, _houseDisplayId: v || '', house_profile_id: null } : s));
                        }}
                      />
                      {game.house_profile_id && houseProfiles[game.house_profile_id] ? (
                        <p className="text-[10px] text-gray-500 mt-1">
                          Saving payouts from {houseProfiles[game.house_profile_id]?.full_name || 'selected user'}.
                        </p>
                      ) : null}
                    </div>

                    <div className="bg-[#0E111E] border border-white/10 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Wallet rule</p>
                      <p className="text-sm text-white font-bold mt-1">Users bet diamonds. Losing bets are burned. Winning payouts subtract diamonds from the selected payout-owner account.</p>
                    </div>

                    {isGreedyGame(game.id) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-[#0E111E] border border-white/10 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Pizza group</p>
                        <p className="text-sm text-white font-bold mt-1">High payout: 10x, 15x, 25x, 45x</p>
                      </div>
                      <div className="bg-[#0E111E] border border-white/10 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Salad group</p>
                        <p className="text-sm text-white font-bold mt-1">Low payout: four 5x items</p>
                      </div>
                    </div>
                    ) : game.id === 'tin_patti_pro' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {TIN_PATTI_PRO_ITEMS.map((item) => (
                        <div key={item.id} className="bg-[#0E111E] border border-white/10 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{item.label}</p>
                          <p className="text-sm text-white font-bold mt-1">Card board result</p>
                        </div>
                      ))}
                    </div>
                    ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {LUCKY_DICE_ITEMS.map((item) => (
                        <div key={item.id} className="bg-[#0E111E] border border-white/10 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{item.label}</p>
                          <p className="text-sm text-white font-bold mt-1">{item.multiplier}x default return</p>
                        </div>
                      ))}
                    </div>
                    )}

                    {game.house_profile_id ? (
                      <div className={`rounded-xl border p-3 ${Number(houseProfiles[game.house_profile_id]?.diamonds ?? 0) <= 0 ? 'bg-red-500/10 border-red-500/30' : Number(houseProfiles[game.house_profile_id]?.diamonds ?? 0) < 100000 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/20'}`}>
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Payout-owner diamond balance</p>
                        <p className="text-xl text-white font-black">
                          {(houseProfiles[game.house_profile_id]?.diamonds ?? 'Unknown').toLocaleString?.() ?? 'Unknown'} diamonds
                        </p>
                        {Number(houseProfiles[game.house_profile_id]?.diamonds ?? 0) <= 0 && (
                          <p className="text-xs text-red-300 font-bold mt-1">Warning: payout-owner balance is negative or empty. Payouts still run, but fund this profile.</p>
                        )}
                        {Number(houseProfiles[game.house_profile_id]?.diamonds ?? 0) > 0 && Number(houseProfiles[game.house_profile_id]?.diamonds ?? 0) < 100000 && (
                          <p className="text-xs text-yellow-300 font-bold mt-1">Warning: payout-owner balance is low for high-multiplier game payouts.</p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <p className="text-xs text-red-300 font-bold">{gameDisplayName(game.id)} cannot accept bets until a payout-owner profile id is saved.</p>
                      </div>
                    )}
                    </>)}
                  </div>
                )}

                {isCrashGame(game.id) ? (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Provably fair configuration</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-400">The backend owns the fixed-point multiplier curve and commitment algorithm. No multiplier table or forced-result field is editable here.</p>
                </div>
                ) : game.id === 'lucky_dice' ? (
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Payout table</label>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {multiplierRows(game).map((row, index) => (
                      <label key={String(row.id)} className="flex items-center justify-between gap-3 bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-300">{String(row.label || row.id).replaceAll('_', ' ')}</span>
                        <span className="flex items-center gap-1">
                          <input
                            aria-label={`${String(row.label || row.id)} multiplier`}
                            type="number"
                            min={1}
                            step="0.1"
                            className="w-20 bg-black/30 border border-white/10 rounded-md px-2 py-1 text-right text-white text-sm focus:outline-none focus:border-pink-500"
                            value={Number(row.m ?? row.multiplier ?? 0)}
                            onChange={(e) => {
                              const rows = multiplierRows(game).map((item, itemIndex) => itemIndex === index ? { ...item, m: Math.max(1, Number(e.target.value) || 1), multiplier: undefined } : item);
                              setSettings(settings.map((s) => s.id === game.id ? { ...s, multipliers: rows, _multipliersText: JSON.stringify(rows, null, 2) } : s));
                            }}
                          />
                          <span className="text-amber-300 font-bold">x</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-2">Changes apply to future settlements. Existing settled rounds are not recalculated.</p>
                </div>
                ) : (
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Multipliers (JSON)</label>
                  <textarea
                    rows={5}
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-pink-500"
                    value={
                      game._multipliersText !== undefined
                        ? game._multipliersText
                        : JSON.stringify(game.multipliers ?? null, null, 2)
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettings(settings.map((s) => s.id === game.id ? { ...s, _multipliersText: v } : s));
                    }}
                  />
                  <p className="text-[10px] text-gray-600 mt-1">
                    {isGreedyGame(game.id)
                      ? 'Format: array of {id, label, category, m} items'
                      : 'Format: array of {id, label, m} boards'}
                  </p>
                </div>
                )}

                <button
                  disabled={saving}
                  onClick={() => saveLimits(game)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={14} /> Save Limits & Multipliers</>}
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Global Reset Card */}
        <button
          onClick={async () => {
            if (!window.confirm('Reset supported games and keep them offline until payout-owner wallets are confirmed?\n\nActive in-progress rounds are not affected.')) return;
            setSaving(true);
            const globalPayoutGames = await supabase
              .from('game_settings')
              .update({ win_chance_percent: 60, is_active: false, forced_next_category: null, forced_next_result: null })
              .in('id', APP_GAME_IDS);
            setSaving(false);
            if (globalPayoutGames.error) {
              alert('Reset failed: ' + globalPayoutGames.error.message);
            } else {
              setSuccess(true);
              setTimeout(() => setSuccess(false), 3000);
              fetchSettings();
            }
          }}
          disabled={saving}
          className="bg-[#1A1230] border-2 border-dashed border-white/10 rounded-[32px] p-8 flex flex-col items-center justify-center text-center opacity-60 hover:opacity-100 hover:border-pink-500/40 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
            {saving ? <Loader2 className="text-gray-400 animate-spin" size={32} /> : <RotateCcw className="text-gray-400" size={32} />}
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Reset All Logic</h3>
          <p className="text-xs text-gray-500 max-w-[200px]">Restore defaults without enabling global payout games before house setup.</p>
        </button>
      </div>
    </div>
  );
}
