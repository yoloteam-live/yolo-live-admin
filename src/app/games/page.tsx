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

export default function GameControlPage() {
  // Super-admin only. Managers who paste the URL get bounced.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any[]>([]);
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
      .select('*');
    
    if (error) {
      console.error("Supabase Error:", error);
    }
    console.log("Game Settings Data:", data);

    if (data) {
      setSettings(data);
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
  // multipliers field is a JSONB so we accept any valid JSON the admin
  // pastes in (teen_patti uses {"win":2}, fruit_roulette uses an array
  // of slot definitions).
  async function saveLimits(game: any) {
    let parsedMultipliers: any = null;
    try {
      parsedMultipliers = JSON.parse(game._multipliersText ?? JSON.stringify(game.multipliers ?? null));
    } catch (_e) {
      alert('Multipliers field must be valid JSON.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('game_settings')
      .update({
        min_bet:        game.min_bet ?? 10,
        // max_bet NULL = uncapped (the place_game_bet RPC skips the
        // per-round check when this is null). Don't coerce blank → 100k.
        max_bet:        game.max_bet ?? null,
        daily_loss_cap: game.daily_loss_cap || null,
        multipliers:    parsedMultipliers,
      })
      .eq('id', game.id);
    setSaving(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    fetchSettings();
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
                  <h2 className="text-2xl font-black text-white capitalize">{game.id.replace('_', ' ')}</h2>
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
                    Win Probability (RTP)
                  </label>
                  <span className="text-2xl font-black text-pink-500">{game.win_chance_percent}%</span>
                </div>
                
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
                
                <div className="flex justify-between mt-4">
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Greedy (Admin Wins)</span>
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Giving (User Wins)</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex gap-4 items-start">
                <AlertTriangle className="text-yellow-500 shrink-0" size={20} />
                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                  Lowering the probability increases the house edge (profit), while raising it makes users win more often. Factory default is <span className="text-white">30%</span>.
                </p>
              </div>

              <button
                disabled={saving}
                onClick={() => updateSetting(game.id, game.win_chance_percent, game.is_active)}
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
                        setSettings(settings.map((s: any) => s.id === game.id ? { ...s, min_bet: v } : s));
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
                        setSettings(settings.map((s: any) => s.id === game.id ? { ...s, max_bet: v } : s));
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
                      setSettings(settings.map((s: any) => s.id === game.id ? { ...s, daily_loss_cap: v } : s));
                    }}
                  />
                  <p className="text-[10px] text-gray-600 mt-1">Per-user limit on net losses (diamonds) over 24 hours.</p>
                </div>

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
                      setSettings(settings.map((s: any) => s.id === game.id ? { ...s, _multipliersText: v } : s));
                    }}
                  />
                  <p className="text-[10px] text-gray-600 mt-1">
                    {game.id === 'teen_patti'
                      ? 'Format: {"win": 2}'
                      : 'Format: array of {id, type, m} slots'}
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
            if (!window.confirm('Reset every game to win_chance_percent = 30% and re-enable them?\n\nThis is the factory default. Active in-progress rounds are not affected.')) return;
            setSaving(true);
            const { error } = await supabase
              .from('game_settings')
              .update({ win_chance_percent: 30, is_active: true })
              .neq('id', '');
            setSaving(false);
            if (error) {
              alert('Reset failed: ' + error.message);
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
          <p className="text-xs text-gray-500 max-w-[200px]">Restore all game probabilities to factory default 30%.</p>
        </button>
      </div>
    </div>
  );
}
