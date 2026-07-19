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
  } | null;
  _houseDisplayId?: string;
  _multipliersText?: string;
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

const GLOBAL_PAYOUT_GAME_IDS = new Set(['greedy_lion', 'tin_patti_pro']);
const APP_GAME_IDS = ['greedy_lion', 'tin_patti_pro'];

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

function globalRules(game: GameSetting) {
  return { ...DEFAULT_GLOBAL_RULES, ...(game.special_result_rules || {}) };
}

function forcedResultItems(gameId: string) {
  if (gameId === 'tin_patti_pro') return TIN_PATTI_PRO_ITEMS;
  return GREEDY_LION_ITEMS;
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
    console.log("Fetching game settings...");
    const { data, error } = await supabase
      .from('game_settings')
      .select('*')
      .in('id', APP_GAME_IDS);
    
    if (error) {
      console.error("Supabase Error:", error);
    }
    console.log("Game Settings Data:", data);

    if (data) {
      setSettings(data);
      const houseIds = data
        .map((row: GameSetting) => row.house_profile_id)
        .filter(Boolean);
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

  async function updateSetting(id: string, winChance: number, isActive: boolean) {
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
    let parsedMultipliers: unknown = null;
    try {
      parsedMultipliers = JSON.parse(game._multipliersText ?? JSON.stringify(game.multipliers ?? null));
    } catch {
      alert('Multipliers field must be valid JSON.');
      return;
    }
    if (isGlobalPayoutGame(game.id) && !game.house_profile_id) {
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
    if (isGlobalPayoutGame(game.id)) {
      const duration = Number(game.round_duration_s ?? 30);
      const display = Number(game.result_display_s ?? 15);
      const rules = globalRules(game);
      const minPayout = Number(rules.target_payout_min_percent ?? 30);
      const maxPayout = Number(rules.target_payout_max_percent ?? 40);
      if (!duration || duration < 5) {
        alert('Round duration must be at least 5 seconds.');
        return;
      }
      if (!display || display < 3) {
        alert('Result popup duration must be at least 3 seconds.');
        return;
      }
      if (minPayout < 0 || maxPayout < minPayout) {
        alert(`${gameDisplayName(game.id)} payout range must be 0 or higher, and max must be greater than or equal to min.`);
        return;
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
    if (isGlobalPayoutGame(game.id)) {
      patch.round_duration_s = Number(game.round_duration_s ?? 30);
      patch.result_display_s = Number(game.result_display_s ?? 15);
      patch.house_profile_id = game.house_profile_id;
      patch.forced_next_category = game.id === 'greedy_lion' && ['pizza', 'salad'].includes(game.forced_next_result || '') ? game.forced_next_result : null;
      patch.forced_next_result = game.forced_next_result || null;
      patch.special_result_rules = globalRules(game);
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
    if (id === 'greedy_lion') return 'Greedy Lion';
    if (id === 'tin_patti_pro') return 'Tin Patti Pro';
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
                    {isGlobalPayoutGame(game.id) ? 'Target Payout Range' : 'Win Probability (RTP)'}
                  </label>
                  <span className="text-2xl font-black text-pink-500">
                    {isGlobalPayoutGame(game.id)
                      ? `${globalRules(game).target_payout_min_percent}-${globalRules(game).target_payout_max_percent}%`
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
                    {isGlobalPayoutGame(game.id) ? 'Lower Payout' : 'Greedy (Admin Wins)'}
                  </span>
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">
                    {isGlobalPayoutGame(game.id) ? 'Higher Payout' : 'Giving (User Wins)'}
                  </span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex gap-4 items-start">
                <AlertTriangle className="text-yellow-500 shrink-0" size={20} />
                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                  {isGlobalPayoutGame(game.id)
                    ? 'Target Payout Range chooses an exact item inside the min/max payout range. If no item is inside the range, it chooses the closest non-zero item below the minimum and avoids going above the maximum.'
                    : <>Lowering the probability increases the house edge (profit), while raising it makes users win more often. Factory default is <span className="text-white">30%</span>.</>}
                </p>
              </div>

              <button
                disabled={saving}
                onClick={() => isGlobalPayoutGame(game.id) ? saveLimits(game) : updateSetting(game.id, game.win_chance_percent, game.is_active)}
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

                {isGlobalPayoutGame(game.id) && (
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
                          {game.id === 'greedy_lion' && <option value="pizza">Pizza</option>}
                          {game.id === 'greedy_lion' && <option value="salad">Salad</option>}
                          {forcedResultItems(game.id).map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {game.id === 'greedy_lion' && (
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

                    {game.id === 'greedy_lion' ? (
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
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {TIN_PATTI_PRO_ITEMS.map((item) => (
                        <div key={item.id} className="bg-[#0E111E] border border-white/10 rounded-xl p-3">
                          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{item.label}</p>
                          <p className="text-sm text-white font-bold mt-1">Card board result</p>
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
                          <p className="text-xs text-yellow-300 font-bold mt-1">Warning: payout-owner balance is low for high-multiplier pizza payouts.</p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                        <p className="text-xs text-red-300 font-bold">{gameDisplayName(game.id)} cannot accept bets until a payout-owner profile id is saved.</p>
                      </div>
                    )}
                  </div>
                )}

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
                    {game.id === 'greedy_lion'
                      ? 'Format: array of {id, label, category, m} items'
                      : 'Format: array of {id, label, m} boards'}
                  </p>
                </div>

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
              .in('id', ['greedy_lion', 'tin_patti_pro']);
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
