"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminAccess } from '@/lib/adminAccess';
import { ADMIN_MODULES, AdminPermissions, PermissionLevel } from '@/lib/adminModules';

type StaffAccount = {
  profile_id: string;
  role: string;
  permissions: AdminPermissions;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  profiles: { full_name?: string } | { full_name?: string }[] | null;
};

function profileName(account: StaffAccount) {
  const profile = Array.isArray(account.profiles) ? account.profiles[0] : account.profiles;
  return profile?.full_name || account.email || account.phone || 'Staff account';
}

export default function StaffAccountsPage() {
  const { access } = useAdminAccess();
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [permissions, setPermissions] = useState<AdminPermissions>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<AdminPermissions>({});

  const roleOptions = useMemo(() => access?.role === 'super_admin'
    ? ['admin', 'manager', 'moderator', 'agency_owner']
    : ['manager', 'moderator'], [access?.role]);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/admin/accounts', { headers: { Authorization: `Bearer ${accessToken}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load staff accounts.');
      setAccounts(payload.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load staff accounts.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    // Network-backed initial hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function setPermission(key: string, level: PermissionLevel | 'none') {
    setPermissions((current) => {
      const next = { ...current };
      if (level === 'none') delete next[key]; else next[key] = level;
      return next;
    });
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ fullName, identifier, password, role, permissions }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not create account.');
      setFullName(''); setIdentifier(''); setPassword(''); setPermissions({});
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create account.'); }
    finally { setSaving(false); }
  }

  async function updateAccount(account: StaffAccount, patch: Record<string, unknown>) {
    setSaving(true); setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ profileId: account.profile_id, ...patch }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not update account.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update account.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-black text-white">Staff Accounts</h2>
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/30">
            <ShieldCheck size={11} /> Permission controlled
          </span>
        </div>
        <p className="text-gray-500 mt-1">Create dashboard credentials and grant only the modules each person needs.</p>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      <form onSubmit={createAccount} className="glass-card p-6 space-y-6">
        <h3 className="text-lg font-black text-white flex items-center gap-2"><Plus size={18} /> Create account</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white text-sm" />
          <input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or phone" className="bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white text-sm" />
          <input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" className="bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white text-sm capitalize">
            {roleOptions.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-black text-white">Module access</h4>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPermissions(Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, 'manage'])))} className="text-xs text-pink-300 hover:text-pink-200">Select all</button>
              <button type="button" onClick={() => setPermissions({})} className="text-xs text-gray-500 hover:text-white">Clear</button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
            {ADMIN_MODULES.map((module) => (
              <div key={module.key} className="flex items-center justify-between rounded-lg bg-black/20 border border-white/5 px-3 py-2">
                <span className="text-xs text-gray-300">{module.name}</span>
                <select value={permissions[module.key] || 'none'} onChange={(e) => setPermission(module.key, e.target.value as PermissionLevel | 'none')} className="bg-[#151225] rounded-md px-2 py-1 text-[11px] text-white border border-white/10">
                  <option value="none">No access</option><option value="manage">Access</option>
                </select>
              </div>
            ))}
          </div>
        </div>
        <button disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-5 py-3 font-black text-white disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={17} /> : <UserCog size={17} />} Create staff account
        </button>
      </form>

      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5"><h3 className="font-black text-white">Existing accounts</h3></div>
        {loading ? <div className="p-12 text-center"><Loader2 className="animate-spin inline text-pink-400" /></div> : (
          <div className="divide-y divide-white/5">
            {accounts.map((account) => (
              <div key={account.profile_id} className="p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white">{profileName(account)}</p>
                    <p className="text-xs text-gray-500">{account.email || account.phone} · <span className="capitalize">{account.role.replace('_', ' ')}</span> · {Object.keys(account.permissions || {}).length} modules</p>
                  </div>
                  <span className={account.is_active ? 'text-xs font-bold text-emerald-300' : 'text-xs font-bold text-red-300'}>{account.is_active ? 'ACTIVE' : 'DISABLED'}</span>
                  {account.role !== 'super_admin' && (
                    <>
                      <button disabled={saving} onClick={() => {
                        const next = window.prompt('New password (8+ characters). Leave blank to cancel.');
                        if (next) updateAccount(account, { password: next });
                      }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:text-white">Reset password</button>
                      <button disabled={saving} onClick={() => updateAccount(account, { isActive: !account.is_active })} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:text-white">
                        {account.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button disabled={saving} onClick={() => {
                        if (editingId === account.profile_id) { setEditingId(null); return; }
                        setEditingId(account.profile_id);
                        setEditingPermissions({ ...(account.permissions || {}) });
                      }} className="rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-2 text-xs text-pink-300">Edit access</button>
                    </>
                  )}
                </div>
                {editingId === account.profile_id && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                      {ADMIN_MODULES.map((adminModule) => (
                        <div key={adminModule.key} className="flex items-center justify-between rounded-lg bg-[#151225] px-3 py-2">
                          <span className="text-xs text-gray-300">{adminModule.name}</span>
                          <select value={editingPermissions[adminModule.key] || 'none'} onChange={(event) => setEditingPermissions((current) => {
                            const next = { ...current };
                            const level = event.target.value as PermissionLevel | 'none';
                            if (level === 'none') delete next[adminModule.key]; else next[adminModule.key] = level;
                            return next;
                          })} className="bg-[#0E111E] rounded-md px-2 py-1 text-[11px] text-white border border-white/10">
                            <option value="none">No access</option><option value="manage">Access</option>
                          </select>
                        </div>
                      ))}
                    </div>
                    <button disabled={saving} onClick={async () => {
                      await updateAccount(account, { permissions: editingPermissions });
                      setEditingId(null);
                    }} className="mt-4 rounded-lg bg-pink-500 px-4 py-2 text-xs font-black text-white flex items-center gap-2"><Save size={12} /> Save access</button>
                  </div>
                )}
              </div>
            ))}
            {!accounts.length && <div className="p-10 text-center text-gray-500">No staff accounts found.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
