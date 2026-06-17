"use client";
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import {
  UserCog, Search, Loader2, UserMinus, UserPlus, ScrollText, ShieldCheck,
} from 'lucide-react';

type ManagerRow = {
  id: string;
  full_name: string | null;
  display_id: number | null;
  avatar_url: string | null;
  created_at: string;
};

type SearchHit = {
  id: string;
  full_name: string | null;
  display_id: number | null;
  role: string;
};

export default function ManagersPage() {
  // Super-admin only — managers managing managers would be a permission
  // loop. The migration's promote_to_manager RPC enforces this too.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const loadManagers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, display_id, avatar_url, created_at')
      .eq('role', 'manager')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('managers load:', error.message);
      setManagers([]);
    } else {
      setManagers((data as ManagerRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadManagers();
  }, [isSuperAdmin, loadManagers]);

  // Lightweight debounced search — looks up plain users / hosts (not
  // already-managers / agencies / super_admins) so the owner can pick
  // one to promote without scrolling the whole users table.
  useEffect(() => {
    if (!isSuperAdmin) return;
    const term = search.trim();
    if (term.length < 2) { setHits([]); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, display_id, role')
        .in('role', ['user', 'host'])
        .limit(20);
      // Numeric search → display_id, otherwise → full_name ilike.
      const asNum = Number(term);
      if (Number.isInteger(asNum) && asNum > 0) {
        q = q.eq('display_id', asNum);
      } else {
        q = q.ilike('full_name', `%${term}%`);
      }
      const { data, error } = await q;
      if (error) console.warn('manager-search:', error.message);
      setHits((data as SearchHit[]) || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [search, isSuperAdmin]);

  async function promote(target: SearchHit) {
    if (actingOn) return;
    const ok = window.confirm(
      `Promote ${target.full_name || target.id} to manager?\n\n` +
      `They will gain access to the admin panel with restricted permissions.`
    );
    if (!ok) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert('Not signed in'); return; }

    setActingOn(target.id);
    const { data, error } = await supabase.rpc('promote_to_manager', {
      p_target: target.id,
      p_admin:  user.id,
    });
    setActingOn(null);
    if (error) { alert('Error: ' + error.message); return; }
    if (!data?.success) { alert(data?.message || 'Failed'); return; }

    setSearch('');
    setHits([]);
    await loadManagers();
  }

  async function demote(m: ManagerRow) {
    if (actingOn) return;
    const ok = window.confirm(
      `Demote ${m.full_name || m.id} back to a normal user?\n\n` +
      `They will lose access to the admin panel immediately.`
    );
    if (!ok) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert('Not signed in'); return; }

    setActingOn(m.id);
    const { data, error } = await supabase.rpc('demote_from_manager', {
      p_target: m.id,
      p_admin:  user.id,
    });
    setActingOn(null);
    if (error) { alert('Error: ' + error.message); return; }
    if (!data?.success) { alert(data?.message || 'Failed'); return; }

    await loadManagers();
  }

  if (roleLoading || !isSuperAdmin) return null;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-black text-white">Managers</h2>
          <span className="flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-1 rounded-full border border-rose-500/30">
            <ShieldCheck size={10} /> Super Admin Only
          </span>
        </div>
        <p className="text-gray-500 mt-1">
          Managers can handle top-ups, applications and DMs but can't move money,
          change roles, or edit the catalogue.
        </p>
      </div>

      {/* Promote section */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
          <UserPlus size={18} className="text-emerald-400" />
          Promote a user to manager
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="Search by display ID or full name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>

        {search.trim().length >= 2 && (
          <div className="mt-3 border border-[#251B45] rounded-xl divide-y divide-[#251B45] bg-[#0E111E] overflow-hidden">
            {searching ? (
              <div className="p-4 flex items-center gap-2 text-gray-500 text-sm">
                <Loader2 className="animate-spin" size={14} /> Searching…
              </div>
            ) : hits.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm">No matches.</div>
            ) : (
              hits.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-3 hover:bg-white/[0.03]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-300">
                      {(h.full_name?.[0] || 'U').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{h.full_name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500 font-mono">
                        ID {h.display_id ?? '—'} · {h.role}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => promote(h)}
                    disabled={actingOn === h.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    {actingOn === h.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                    Promote
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Current managers */}
      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <UserCog size={18} className="text-amber-300" />
            Current managers
            <span className="text-xs text-gray-500 font-normal">
              ({managers.length})
            </span>
          </h3>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Manager</th>
              <th className="px-6 py-4 font-black">Display ID</th>
              <th className="px-6 py-4 font-black">Promoted</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline-block" size={20} />
                </td>
              </tr>
            ) : managers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No managers yet — promote one using the search above.
                </td>
              </tr>
            ) : (
              managers.map((m) => (
                <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-bold text-amber-300 overflow-hidden">
                        {m.avatar_url
                          ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                          : (m.full_name?.[0]?.toUpperCase() || 'M')}
                      </div>
                      <p className="font-bold text-white">{m.full_name || 'Unknown'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-300 font-mono text-xs">
                    {m.display_id ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-xs">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex gap-2">
                      <Link
                        href={`/managers/${m.id}/audit`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold transition"
                      >
                        <ScrollText size={12} /> View activity
                      </Link>
                      <button
                        onClick={() => demote(m)}
                        disabled={actingOn === m.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/30 text-xs font-bold hover:bg-orange-500/25 disabled:opacity-50"
                      >
                        {actingOn === m.id ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                        Demote
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
