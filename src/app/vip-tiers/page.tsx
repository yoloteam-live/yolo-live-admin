"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { Crown, Loader2, Save, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';

type Tier = {
  id: string;
  name: string;
  rank: number;
  badge_color: string;
  pricing: Record<string, number>;
  perks: string[];
  is_active: boolean;
  display_order: number;
};

const DEFAULT_DAYS = [7, 15, 30];

export default function VipTiersPage() {
  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
    const ch = supabase
      .channel('admin-vip-tiers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vip_tiers' }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('vip_tiers').select('*').order('display_order');
    setTiers((data as Tier[]) || []);
    setLoading(false);
  }

  async function saveTier(t: Tier) {
    // Defense-in-depth: refuse to save a tier with any zero / negative
    // price entry. The number input below also clamps to >= 1 per change,
    // but a stale keyboard value or copy-paste can still slip something
    // through; this catch is the last line before the row hits the DB.
    const bogus = Object.entries(t.pricing).find(([, v]) => !Number.isFinite(Number(v)) || Number(v) < 1);
    if (bogus) {
      alert(`Pricing for ${bogus[0]} days must be at least 1 diamond.`);
      return;
    }
    if (!Number.isFinite(t.rank) || t.rank < 1) {
      alert('Tier rank must be a positive number.');
      return;
    }
    setSavingId(t.id);
    const { error } = await supabase
      .from('vip_tiers')
      .update({
        name:          t.name,
        rank:          t.rank,
        badge_color:   t.badge_color,
        pricing:       t.pricing,
        perks:         t.perks,
        is_active:     t.is_active,
        display_order: t.display_order,
      })
      .eq('id', t.id);
    setSavingId(null);
    if (error) alert('Failed: ' + error.message);
  }

  async function toggleActive(t: Tier) {
    const { error } = await supabase.from('vip_tiers').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) alert('Failed: ' + error.message);
  }

  async function addDuration(t: Tier, daysStr: string) {
    const days = parseInt(daysStr);
    if (!days || days < 1) return;
    const next = { ...t.pricing, [String(days)]: 0 };
    setTiers(tiers.map((x) => x.id === t.id ? { ...x, pricing: next } : x));
  }

  function updatePerk(t: Tier, idx: number, val: string) {
    const next = [...t.perks];
    if (val === '') next.splice(idx, 1);
    else next[idx] = val;
    setTiers(tiers.map((x) => x.id === t.id ? { ...x, perks: next } : x));
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-pink-600 flex items-center justify-center">
          <Crown className="text-white" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">VIP Tiers</h1>
          <p className="text-xs text-gray-500">Pricing, perks and rank — drives purchase_vip RPC</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-amber-500" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {tiers.map((t) => (
            <div key={t.id} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/5 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${t.badge_color}22, transparent)` }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-sm" style={{ background: t.badge_color }}>
                    {t.id}
                  </div>
                  <div>
                    <p className="text-white font-black text-lg">{t.name}</p>
                    <p className="text-xs text-gray-500">Rank {t.rank}</p>
                  </div>
                </div>
                <button onClick={() => toggleActive(t)}>
                  {t.is_active ? <CheckCircle2 className="text-green-400" size={20} /> : <XCircle className="text-gray-500" size={20} />}
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Display name</label>
                    <input
                      className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                      value={t.name}
                      onChange={(e) => setTiers(tiers.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Rank</label>
                    <input
                      type="number"
                      className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                      value={t.rank}
                      onChange={(e) => setTiers(tiers.map((x) => x.id === t.id ? { ...x, rank: parseInt(e.target.value) || 0 } : x))}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] uppercase text-gray-500 font-bold">Badge color</label>
                    <div className="flex gap-2 items-center">
                      <div className="w-9 h-9 rounded-lg border border-white/10" style={{ background: t.badge_color }} />
                      <input
                        className="flex-1 bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
                        value={t.badge_color}
                        onChange={(e) => setTiers(tiers.map((x) => x.id === t.id ? { ...x, badge_color: e.target.value } : x))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold block mb-2">Pricing (💎 per duration)</label>
                  <div className="space-y-2">
                    {Object.entries(t.pricing).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([days, cost]) => (
                      <div key={days} className="flex items-center gap-2">
                        <span className="text-white text-sm w-16">{days}d</span>
                        <input
                          type="number"
                          min={1}
                          className="flex-1 bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                          value={cost}
                          onChange={(e) => {
                            // Clamp at >= 1 here so the inline state never
                            // holds a zero/negative; the saveTier guard is
                            // a second line of defence.
                            const raw = parseInt(e.target.value);
                            const next = { ...t.pricing, [days]: Number.isFinite(raw) && raw >= 1 ? raw : 1 };
                            setTiers(tiers.map((x) => x.id === t.id ? { ...x, pricing: next } : x));
                          }}
                        />
                        <button
                          onClick={() => {
                            const { [days]: _drop, ...rest } = t.pricing;
                            setTiers(tiers.map((x) => x.id === t.id ? { ...x, pricing: rest } : x));
                          }}
                          className="p-2 hover:bg-red-400/10 rounded-lg text-gray-400 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <select
                        defaultValue=""
                        onChange={(e) => { addDuration(t, e.target.value); e.target.value = ''; }}
                        className="bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-xs"
                      >
                        <option value="">+ Add duration…</option>
                        {DEFAULT_DAYS.filter((d) => !t.pricing[String(d)]).map((d) => <option key={d} value={d}>{d} days</option>)}
                        <option value="90">90 days</option>
                        <option value="180">180 days</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold block mb-2">Perks</label>
                  <div className="space-y-1.5">
                    {t.perks.map((p, i) => (
                      <input
                        key={i}
                        className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500"
                        value={p}
                        onChange={(e) => updatePerk(t, i, e.target.value)}
                        placeholder="Empty to remove"
                      />
                    ))}
                    <button
                      onClick={() => setTiers(tiers.map((x) => x.id === t.id ? { ...x, perks: [...x.perks, ''] } : x))}
                      className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1"
                    >
                      <Plus size={11} /> Add perk
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => saveTier(t)}
                  disabled={savingId === t.id}
                  className="w-full bg-gradient-to-r from-amber-500 to-pink-600 hover:scale-[1.02] text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {savingId === t.id ? <Loader2 className="animate-spin" size={16} /> : <><Save size={14} /> Save</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}