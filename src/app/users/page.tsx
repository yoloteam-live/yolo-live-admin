"use client";
import { useState, useEffect } from 'react';
import { Search, Filter, Edit2, Shield, Ban, Diamond, Sparkles, CheckCircle2, XCircle, Loader2, Crown, UserMinus, Bell, BellOff, MessageSquare, MessageSquareOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';

export default function UsersPage() {
  // Managers can still see + ban users but can't move money or change
  // roles. We hide the inputs entirely and also force NULL into those
  // RPC params so a hand-rolled DOM edit can't slip a value through.
  const { isSuperAdmin } = useAdminRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetchUsers();
    checkConnection();
  }, []);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const [promoteUser, setPromoteUser] = useState<any>(null);
  const [promoteCode, setPromoteCode] = useState('');
  const [promoteName, setPromoteName] = useState('');
  const [promoting, setPromoting] = useState(false);

  const [demoteUser, setDemoteUser] = useState<any>(null);
  const [demoteReason, setDemoteReason] = useState('');
  const [demoting, setDemoting] = useState(false);

  async function demoteAgencyOwner() {
    if (!demoteUser) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Not signed in');

    setDemoting(true);
    const { data, error } = await supabase.rpc('demote_agency_owner', {
      p_admin_id: user.id,
      p_user_id: demoteUser.id,
      p_reason: demoteReason.trim() || null,
    });
    setDemoting(false);

    if (error) return alert('Error: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');

    alert(
      `Demoted ${demoteUser.full_name}.\n` +
      `Agency suspended. ${data.released_hosts || 0} host(s) released. ` +
      `${(data.stock_left || 0).toLocaleString()} 💎 stock retained for audit.`
    );
    setDemoteUser(null);
    setDemoteReason('');
    fetchUsers();
  }

  async function promoteToAgencyOwner() {
    if (!promoteUser) return;
    if (promoteCode.trim().length < 3) {
      alert('Agency code must be at least 3 characters.');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert('Not signed in');

    setPromoting(true);
    const { data, error } = await supabase.rpc('promote_to_agency_owner', {
      p_admin_id: user.id,
      p_user_id: promoteUser.id,
      p_proposed_code: promoteCode.trim().toUpperCase(),
      p_proposed_name: promoteName.trim() || null,
    });
    setPromoting(false);

    if (error) return alert('Error: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');

    if (data.reactivated) {
      alert(
        `Reactivated agency for ${promoteUser.full_name}.\n` +
        `Agency: ${data.name}\n\n` +
        `Existing host history, payouts and diamond stock are preserved.`
      );
    } else {
      alert(`Promoted ${promoteUser.full_name} to agency owner. Agency: ${data.name}`);
    }
    setPromoteUser(null);
    setPromoteCode('');
    setPromoteName('');
    fetchUsers();
  }

  async function checkConnection() {
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      setConnected(!error);
    } catch (e) {
      setConnected(false);
    }
  }

  async function fetchUsers() {
    setLoading(true);
    try {
      // Bounded query — caps at 200 rows so the page loads instantly even
      // when the platform has hundreds of thousands of users. Search/
      // filter UI works on this in-memory window; if support needs a
      // user past the window, they can search by display_id or full
      // name (both indexed).
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_id, full_name, avatar_url, role, status, diamonds, beans, is_banned, is_deleted, push_notifications_enabled, dm_notifications_enabled, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('users fetch:', error.message);
        setUsers([]);
      } else {
        // No more fake fallback rows. An empty platform shows an empty
        // table (see the empty-state below), so admins see real state
        // and don't get mislead by fake "Robin Hood" sample data.
        setUsers(data || []);
      }
    } catch (e) {
      console.error(e);
      setUsers([]);
    }
    setLoading(false);
  }

  async function updateUser() {
    if (!editingUser) return;
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        alert('Not signed in');
        return;
      }

      // Lowercase the role + status for DB CHECK constraint compatibility
      const roleNorm = (editingUser.role || '').toString().toLowerCase().replace(' ', '_');
      const statusNorm = editingUser.status
        ? editingUser.status.toString().toLowerCase()
        : null;

      const { data, error } = await supabase.rpc('admin_update_user', {
        p_admin_id: authUser.id,
        p_user_id: editingUser.id,
        p_full_name: editingUser.full_name ?? null,
        // Managers cannot move money or change roles — force NULL so
        // the RPC short-circuits even if a stale DOM value lingers.
        p_diamonds: isSuperAdmin && editingUser.diamonds != null
          ? parseInt(editingUser.diamonds.toString()) || 0
          : null,
        p_beans: isSuperAdmin && editingUser.beans != null
          ? parseInt(editingUser.beans.toString()) || 0
          : null,
        p_role: isSuperAdmin ? (roleNorm || null) : null,
        p_status: statusNorm,
        p_is_banned: null,
      });

      if (error) {
        // Supabase error objects have non-enumerable properties — log fields explicitly
        console.error("Update Error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        alert("Update Failed: " + (error.message || JSON.stringify(error)));
      } else if (!data?.success) {
        alert(data?.message || 'Update failed');
      } else {
        setIsEditModalOpen(false);
        setEditingUser(null);
        fetchUsers();
        alert("Profile updated successfully!");
      }
    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    }
    setLoading(false);
  }

  // Admin override for the per-user notification preferences. Use it
  // sparingly — normally users manage these themselves from Settings.
  // We pass the side we want to flip and leave the other one NULL so
  // the RPC keeps it untouched.
  async function togglePref(userId: string, kind: 'push' | 'dm', current: boolean) {
    const next = !current;
    const { data, error } = await supabase.rpc('admin_set_user_notification_prefs', {
      p_user_id: userId,
      p_push:    kind === 'push' ? next : null,
      p_dm:      kind === 'dm'   ? next : null,
    });
    if (error)            { alert('Failed: ' + error.message); return; }
    if (!data?.success)   { alert(data?.message || 'Failed'); return; }
    setUsers((cur) => cur.map((u) => u.id === userId
      ? { ...u, [kind === 'push' ? 'push_notifications_enabled' : 'dm_notifications_enabled']: next }
      : u
    ));
  }

  async function toggleBan(userId: string, currentStatus: string) {
    const shouldBan = currentStatus !== 'Banned';
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error } = await supabase.rpc('admin_update_user', {
        p_admin_id: authUser.id,
        p_user_id: userId,
        p_is_banned: shouldBan,
        p_status: shouldBan ? 'banned' : 'active',
        p_full_name: null,
        p_diamonds: null,
        p_beans: null,
        p_role: null,
      });

      if (!error && data?.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, status: shouldBan ? 'Banned' : 'Active' } : u));
      } else if (error) {
        alert('Failed: ' + error.message);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const filteredUsers = users.filter(user => 
    (user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    user.display_id?.toString().includes(searchTerm))
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white">User Management</h2>
            {connected === true && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
                <CheckCircle2 size={10} /> Connected
              </span>
            )}
            {connected === false && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded-full border border-red-400/20">
                <XCircle size={10} /> Disconnected
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">Monitor and control all accounts in your system.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by ID or Name..." 
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-pink-500 w-64 text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all" onClick={fetchUsers}>
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Filter size={20} />}
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">User Info</th>
              <th className="px-6 py-4 font-black">Role</th>
              <th className="px-6 py-4 font-black text-center">Diamonds</th>
              <th className="px-6 py-4 font-black text-center">Beans</th>
              <th className="px-6 py-4 font-black text-center">Notifications</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {!loading && filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {users.length === 0
                    ? 'No users yet — the profiles table is empty.'
                    : 'No users match your filters.'}
                </td>
              </tr>
            )}
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center font-bold text-pink-500 border border-pink-500/20 group-hover:scale-110 transition-transform">
                      {user.full_name?.[0] || 'U'}
                    </div>
                    <div>
                      <p className="font-bold text-white">{user.full_name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500 font-mono">ID: {user.display_id || 'Generating...'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {(() => {
                    // The DB stores role in snake_case (`user`, `host`,
                    // `agency_owner`, `admin`, `super_admin`) — updateUser()
                    // above normalizes anything entered to that shape. The
                    // old code compared against Title Case ("Host", "Agency
                    // Owner") so non-User badges were never coloured. Now
                    // we colour by the actual stored shape and render a
                    // friendly label on top.
                    const role  = (user.role || 'user').toString();
                    const label = role
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c: string) => c.toUpperCase());
                    const tone =
                      role === 'super_admin'   ? 'bg-rose-500/15 text-rose-300'   :
                      role === 'admin'         ? 'bg-amber-500/15 text-amber-300' :
                      role === 'manager'       ? 'bg-amber-500/15 text-amber-300' :
                      role === 'agency_owner'  ? 'bg-purple-500/10 text-purple-500' :
                      role === 'host'          ? 'bg-orange-500/10 text-orange-500' :
                                                 'bg-blue-500/10 text-blue-500';
                    return (
                      <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${tone}`}>
                        {label}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Diamond size={12} className="text-pink-500" />
                    <span className="font-black text-white">{(user.diamonds || 0).toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Sparkles size={12} className="text-yellow-500" />
                    <span className="font-black text-white">{(user.beans || 0).toLocaleString()}</span>
                  </div>
                </td>
                {/* Per-user push + DM toggles. Default to TRUE if the
                    column hasn't been populated yet (older accounts). */}
                {(() => {
                  const pushOn = user.push_notifications_enabled !== false;
                  const dmOn   = user.dm_notifications_enabled   !== false;
                  return (
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => togglePref(user.id, 'push', pushOn)}
                          title={pushOn ? 'Push notifications ON — click to disable' : 'Push notifications OFF — click to enable'}
                          className={`p-1.5 rounded-lg ${pushOn ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-gray-500 hover:bg-white/5'}`}
                        >
                          {pushOn ? <Bell size={14} /> : <BellOff size={14} />}
                        </button>
                        <button
                          onClick={() => togglePref(user.id, 'dm', dmOn)}
                          title={dmOn ? 'Direct messages ON — click to disable' : 'Direct messages OFF — click to enable'}
                          className={`p-1.5 rounded-lg ${dmOn ? 'text-cyan-400 hover:bg-cyan-400/10' : 'text-gray-500 hover:bg-white/5'}`}
                        >
                          {dmOn ? <MessageSquare size={14} /> : <MessageSquareOff size={14} />}
                        </button>
                      </div>
                    </td>
                  );
                })()}
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                    user.status === 'Active' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                  }`}>
                    {user.status || 'Active'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"
                      onClick={() => {
                        setEditingUser({ ...user });
                        setIsEditModalOpen(true);
                      }}
                    >
                      <Edit2 size={16} />
                    </button>
                    {user.role !== 'agency_owner' && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'manager' && (
                      <button
                        className="p-2 hover:bg-purple-400/10 rounded-lg text-gray-400 hover:text-purple-400 transition-all"
                        onClick={() => {
                          setPromoteUser(user);
                          setPromoteCode('');
                          setPromoteName('');
                        }}
                        title="Promote to Agency Owner"
                      >
                        <Crown size={16} />
                      </button>
                    )}
                    {user.role === 'agency_owner' && (
                      <button
                        className="p-2 hover:bg-orange-400/10 rounded-lg text-gray-400 hover:text-orange-400 transition-all"
                        onClick={() => {
                          setDemoteUser(user);
                          setDemoteReason('');
                        }}
                        title="Demote Agency Owner"
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                    <button className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-blue-400 transition-all">
                      <Shield size={16} />
                    </button>
                    <button 
                      className={`p-2 hover:bg-white/5 rounded-lg transition-all ${user.status === 'Banned' ? 'text-green-400 hover:bg-green-400/10' : 'text-gray-400 hover:text-red-400 hover:bg-red-400/10'}`}
                      onClick={() => toggleBan(user.id, user.status)}
                      title={user.status === 'Banned' ? 'Unban User' : 'Ban User'}
                    >
                      <Ban size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Promote to Agency Owner Modal */}
      {promoteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Crown size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Promote to Agency Owner</h3>
                <p className="text-xs text-gray-500">{promoteUser.full_name} • ID {promoteUser.display_id}</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Agency Code *</label>
                <input
                  type="text"
                  placeholder="GALAXY-2026"
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white font-mono uppercase focus:outline-none focus:border-purple-500"
                  value={promoteCode}
                  onChange={(e) => setPromoteCode(e.target.value.toUpperCase())}
                />
                <p className="text-[10px] text-gray-500 mt-2">Hosts will use this code to join. Cannot be changed later.</p>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">
                  Agency Name (optional)
                </label>
                <input
                  type="text"
                  placeholder={`${promoteUser.full_name}'s Agency`}
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                  value={promoteName}
                  onChange={(e) => setPromoteName(e.target.value)}
                />
                <p className="text-[10px] text-gray-500 mt-2">Owner can rename later from their dashboard.</p>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-xs text-yellow-300">
                ⚠ User's role will be set to <strong>agency_owner</strong> and an agency will be created instantly.
              </div>
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all"
                onClick={() => setPromoteUser(null)}
                disabled={promoting}
              >
                Cancel
              </button>
              <button
                className="flex-[2] bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-[1.02] text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={promoteToAgencyOwner}
                disabled={promoting || !promoteCode.trim()}
              >
                {promoting ? <Loader2 className="animate-spin" size={18} /> : <Crown size={16} />}
                Promote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demote Agency Owner Modal */}
      {demoteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <UserMinus size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Demote Agency Owner</h3>
                <p className="text-xs text-gray-500">{demoteUser.full_name} • ID {demoteUser.display_id}</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-xs text-orange-300 space-y-1">
                <p>⚠ This will:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Suspend the agency (removed from app picker)</li>
                  <li>Release all active hosts back to free state</li>
                  <li>Reset this user's role to <strong>user</strong></li>
                  <li>Retain remaining diamond stock for audit / refund</li>
                </ul>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">
                  Reason (optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. inactive, policy violation, owner request..."
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 text-sm"
                  value={demoteReason}
                  onChange={(e) => setDemoteReason(e.target.value)}
                />
                <p className="text-[10px] text-gray-500 mt-2">Stored in admin_audit_log for record.</p>
              </div>
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all"
                onClick={() => setDemoteUser(null)}
                disabled={demoting}
              >
                Cancel
              </button>
              <button
                className="flex-[2] bg-gradient-to-r from-orange-500 to-red-500 hover:scale-[1.02] text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={demoteAgencyOwner}
                disabled={demoting}
              >
                {demoting ? <Loader2 className="animate-spin" size={18} /> : <UserMinus size={16} />}
                Demote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5">
              <h3 className="text-xl font-black text-white">Edit User Profile</h3>
              <p className="text-xs text-gray-500">Updating ID: {editingUser.display_id || editingUser.id}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Full Name</label>
                <input 
                  type="text" 
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500"
                  value={editingUser.full_name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                />
              </div>

              {isSuperAdmin && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Diamonds</label>
                    <div className="relative">
                      <Diamond className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500" size={14} />
                      <input
                        type="number"
                        className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-500"
                        value={editingUser.diamonds || 0}
                        onChange={(e) => setEditingUser({ ...editingUser, diamonds: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Beans</label>
                    <div className="relative">
                      <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500" size={14} />
                      <input
                        type="number"
                        className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-500"
                        value={editingUser.beans || 0}
                        onChange={(e) => setEditingUser({ ...editingUser, beans: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {isSuperAdmin && (
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">System Role</label>
                  <select
                    className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500 appearance-none"
                    value={editingUser.role || 'User'}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  >
                    <option value="User">User</option>
                    <option value="Host">Host</option>
                    <option value="Agency Owner">Agency Owner</option>
                    <option value="manager">Manager</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              )}
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button 
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </button>
              <button 
                className="flex-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-105 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-pink-500/20"
                onClick={updateUser}
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
