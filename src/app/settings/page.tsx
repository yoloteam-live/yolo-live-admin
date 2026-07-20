"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Shield, Save, Loader2, CheckCircle2, AlertTriangle, DollarSign,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';

type Settings = {
  platform_name: string;
  support_email: string;
  signup_enabled: boolean;
  live_enabled: boolean;
  gifting_enabled: boolean;
  games_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  maintenance_bypass_user_ids: string[];
  // Economy / gameplay tunables — read by RPCs (lucky bag, level system).
  lucky_bag_ttl_seconds: number;
  level_exp_multiplier:  number;
  // Diamond / bean pricing (migration 76). All three are BDT per 1000
  // units, so 10 means "10 BDT per 1000 diamonds" → 1000 BDT per lakh.
  bulk_diamond_bdt_per_1000: number;   // admin → reseller/agency price
  sell_diamond_bdt_per_1000: number;   // reseller/agency → end-user price
  host_payout_bdt_per_1000:  number;   // agency → host payout per 1000 beans
  host_hour_reward: { enabled: boolean; beans: number; minutes: number };
};

const DEFAULTS: Settings = {
  platform_name: 'Care Live',
  support_email: 'support@yolo.live',
  signup_enabled: true,
  live_enabled: true,
  gifting_enabled: true,
  games_enabled: true,
  maintenance_mode: false,
  maintenance_message: "We'll be right back.",
  maintenance_bypass_user_ids: [],
  lucky_bag_ttl_seconds: 60,
  level_exp_multiplier:  1500,
  bulk_diamond_bdt_per_1000: 10,
  sell_diamond_bdt_per_1000: 11,
  host_payout_bdt_per_1000:  9,
  host_hour_reward: { enabled: true, beans: 6000, minutes: 60 },
};

export default function SettingsPage() {
  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('system_settings').select('key, value');
    if (error) {
      console.warn('settings load:', error.message);
      setLoading(false);
      return;
    }
    const merged: Settings & Record<string, unknown> = { ...DEFAULTS };
    (data || []).forEach((row) => {
      merged[row.key] = row.value;
    });
    merged.maintenance_bypass_user_ids = normalizeMaintenanceBypassIds(merged.maintenance_bypass_user_ids);
    setSettings(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void Promise.resolve().then(load);
  }, [isSuperAdmin, load]);

  if (roleLoading || !isSuperAdmin) return null;

  async function save() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return alert('Not signed in'); }

    const updates = {
      ...settings,
      maintenance_bypass_user_ids: normalizeMaintenanceBypassIds(settings.maintenance_bypass_user_ids),
    };

    const { data, error } = await supabase.rpc('update_system_settings', {
      p_admin_id: user.id,
      p_updates: updates,
    });
    setSaving(false);
    if (error) return alert('Save failed: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Save failed');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  const setField = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-pink-500 mb-3" size={36} />
        <p className="text-gray-400 text-sm">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-black text-white">System Settings</h2>
          <p className="text-gray-500 mt-1">Configure your platform. All changes are audit-logged.</p>
        </div>
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-xl flex items-center gap-2 text-green-400">
            <CheckCircle2 size={18} />
            <span className="text-sm font-bold">Saved!</span>
          </div>
        )}
      </div>

      {/* General */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="text-pink-500" size={24} />
          <h3 className="text-xl font-bold text-white">General</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field
            label="Platform Name"
            value={settings.platform_name}
            onChange={(v) => setField('platform_name', v)}
          />
          <Field
            label="Support Email"
            value={settings.support_email}
            onChange={(v) => setField('support_email', v)}
            type="email"
          />
        </div>
      </div>

      {/* Feature toggles */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="text-blue-500" size={24} />
          <h3 className="text-xl font-bold text-white">Feature Toggles</h3>
        </div>
        <div className="space-y-3">
          <Toggle label="Allow new signups" desc="When off, signup screen rejects new users."
            value={settings.signup_enabled} onChange={(v) => setField('signup_enabled', v)} />
          <Toggle label="Live streaming enabled" desc="Disable to prevent any new live from starting."
            value={settings.live_enabled} onChange={(v) => setField('live_enabled', v)} />
          <Toggle label="Gifting enabled" desc="Allow users to send gifts to broadcasters."
            value={settings.gifting_enabled} onChange={(v) => setField('gifting_enabled', v)} />
          <Toggle label="Games enabled" desc="Allow Greedy Lion and Tin Patti Pro inside live rooms."
            value={settings.games_enabled} onChange={(v) => setField('games_enabled', v)} />
        </div>
      </div>

      {/* Economy / Gameplay */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="text-pink-500" size={24} />
          <h3 className="text-xl font-bold text-white">Economy & Gameplay</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field
            label="Lucky Bag TTL (seconds)"
            type="number"
            hint="How long a lucky bag stays claimable before auto-expiring. Default 60."
            value={String(settings.lucky_bag_ttl_seconds)}
            onChange={(v) => setField('lucky_bag_ttl_seconds', Math.max(5, parseInt(v) || 0))}
          />
          <Field
            label="EXP per level"
            type="number"
            hint="Multiplier the level system uses: level N requires N × this much EXP. Default 1500."
            value={String(settings.level_exp_multiplier)}
            onChange={(v) => setField('level_exp_multiplier', Math.max(1, parseInt(v) || 0))}
          />
        </div>
      </div>

      {/* Diamond / Bean Pricing — controls reseller buy, user sale,
          and host payout rates platform-wide. Migration 76 + mobile
          systemSettings realtime sub means changes propagate to every
          phone within ~1 second of saving. */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="text-green-500" size={24} />
          <h3 className="text-xl font-bold text-white">Diamond & Bean Pricing</h3>
        </div>
        <div className="text-xs text-gray-500 mb-5 leading-relaxed">
          All three rates are <b className="text-white">BDT per 1,000 units</b>. The platform-wide spread between bulk and sale is the
          reseller / agency gross margin per diamond. Host payout per 1,000 beans is the salary an agency owner pays
          their host on settlement.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Field
            label="Bulk Buy Rate"
            type="number"
            hint="BDT a reseller / agency owner pays YOU per 1,000 diamonds. Default 10 → 1,000 BDT per lakh."
            value={String(settings.bulk_diamond_bdt_per_1000)}
            onChange={(v) => setField('bulk_diamond_bdt_per_1000', Math.max(0, parseFloat(v) || 0))}
          />
          <Field
            label="User Sale Rate"
            type="number"
            hint="BDT a normal user pays a reseller / agency per 1,000 diamonds. Default 11 → 1,100 BDT per lakh."
            value={String(settings.sell_diamond_bdt_per_1000)}
            onChange={(v) => setField('sell_diamond_bdt_per_1000', Math.max(0, parseFloat(v) || 0))}
          />
          <Field
            label="Host Payout Rate"
            type="number"
            hint="BDT a host receives from their agency per 1,000 beans. Default 9 → 900 BDT per lakh."
            value={String(settings.host_payout_bdt_per_1000)}
            onChange={(v) => setField('host_payout_bdt_per_1000', Math.max(0, parseFloat(v) || 0))}
          />
        </div>
        <div className="mt-5 p-4 rounded-xl bg-green-500/5 border border-green-500/15">
          <p className="text-xs text-green-300 font-bold mb-1">Pricing preview (1 lakh = 100,000)</p>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>Reseller / agency buys: <b className="text-white">৳{(settings.bulk_diamond_bdt_per_1000 * 100).toLocaleString()}</b> per lakh diamonds</li>
            <li>User pays reseller / agency: <b className="text-white">৳{(settings.sell_diamond_bdt_per_1000 * 100).toLocaleString()}</b> per lakh diamonds</li>
            <li>Agency pays host: <b className="text-white">৳{(settings.host_payout_bdt_per_1000 * 100).toLocaleString()}</b> per lakh beans</li>
            <li>Reseller / agency margin: <b className="text-white">৳{((settings.sell_diamond_bdt_per_1000 - settings.bulk_diamond_bdt_per_1000) * 100).toLocaleString()}</b> per lakh diamonds</li>
          </ul>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6"><DollarSign className="text-amber-400" size={24}/><div><h3 className="text-xl font-bold text-white">Daily Host Live Reward</h3><p className="text-xs text-gray-500">Cumulative video time, reset at midnight Asia/Dhaka. Audio does not count.</p></div></div>
        <Toggle label="Reward enabled" desc="Credit each eligible host at most once per Bangladesh calendar day." value={settings.host_hour_reward?.enabled !== false} onChange={(v)=>setField('host_hour_reward',{...(settings.host_hour_reward||DEFAULTS.host_hour_reward),enabled:v})}/>
        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <Field label="Reward beans" type="number" value={String(settings.host_hour_reward?.beans ?? 6000)} onChange={(v)=>setField('host_hour_reward',{...(settings.host_hour_reward||DEFAULTS.host_hour_reward),beans:Math.max(0,parseInt(v)||0)})}/>
          <Field label="Required video minutes" type="number" value={String(settings.host_hour_reward?.minutes ?? 60)} onChange={(v)=>setField('host_hour_reward',{...(settings.host_hour_reward||DEFAULTS.host_hour_reward),minutes:Math.max(1,parseInt(v)||60)})}/>
        </div>
      </div>

      {/* Maintenance */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="text-yellow-500" size={24} />
          <h3 className="text-xl font-bold text-white">Maintenance</h3>
        </div>
        <Toggle
          label="Maintenance mode"
          desc="When on, the mobile app should display the message below and block normal usage."
          value={settings.maintenance_mode}
          onChange={(v) => setField('maintenance_mode', v)}
        />
        <div className="mt-4">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">
            Maintenance Message
          </label>
          <textarea
            className="w-full bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500 min-h-[80px]"
            value={settings.maintenance_message}
            onChange={(e) => setField('maintenance_message', e.target.value)}
          />
        </div>
        <div className="mt-4">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">
            Bypass User IDs
          </label>
          <textarea
            className="w-full bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500 min-h-[96px]"
            placeholder="One user UUID or display ID per line"
            value={settings.maintenance_bypass_user_ids.join('\n')}
            onChange={(e) => setField('maintenance_bypass_user_ids', normalizeMaintenanceBypassIds(e.target.value))}
          />
          <p className="text-[10px] text-gray-600 mt-2">
            Users listed here will keep using the app while maintenance mode is on. Everyone else sees the maintenance screen.
          </p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.01] active:scale-[0.99] transition-all text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-pink-500/20 disabled:opacity-50"
      >
        {saving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> Save All Settings</>}
      </button>
    </div>
  );
}

function normalizeMaintenanceBypassIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,\s]+/);
  return Array.from(new Set(
    raw
      .map((id) => String(id).trim())
      .filter(Boolean)
  ));
}

function Field({ label, value, onChange, type = 'text', hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500"
      />
      {hint && <p className="text-[10px] text-gray-600">{hint}</p>}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex justify-between items-center p-4 rounded-xl bg-white/5 border border-white/5">
      <div className="mr-4">
        <p className="font-bold text-sm text-white">{label}</p>
        <p className="text-xs text-gray-500 mt-1">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full p-1 transition-all ${value ? 'bg-pink-500' : 'bg-gray-700'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}
