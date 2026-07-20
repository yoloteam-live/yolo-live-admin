"use client";
import { useState, useEffect } from 'react';
import {
  Search, ShieldCheck, TrendingUp, Users, Loader2, CheckCircle2, XCircle, Ban, RefreshCw, UserPlus, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Agency = {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  status: string;
  member_count: number;
  payout_rate: number;
  accumulated_beans: number;
  diamond_balance: number;
  created_at: string;
  owner?: { full_name: string; display_id: number };
};

type JoinRequest = {
  id: string; user_id: string; agency_id: string; status: string; applicant_note?: string;
  created_at: string; user?: { full_name: string; display_id: number; avatar_url?: string };
  agency?: { name: string; code: string };
};

type AgencyMember = {
  host_id: string; status: string; joined_at: string;
  host?: { full_name: string; display_id: number; avatar_url?: string };
};

export default function AgenciesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, members: 0, payouts: 0 });
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [assignAgency, setAssignAgency] = useState<Agency | null>(null);
  const [agencyMembers, setAgencyMembers] = useState<AgencyMember[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userMatches, setUserMatches] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [agenciesRes, payoutSumRes, requestsRes] = await Promise.all([
      supabase
        .from('agencies')
        .select('*, owner:profiles!agencies_owner_id_fkey(full_name, display_id)')
        .order('created_at', { ascending: false }),
      supabase
        .from('agency_payouts')
        .select('bdt_value')
        .eq('status', 'paid'),
      supabase
        .from('agency_join_requests')
        .select('id,user_id,agency_id,status,applicant_note,created_at,user:profiles!agency_join_requests_user_id_fkey(full_name,display_id,avatar_url),agency:agencies!agency_join_requests_agency_id_fkey(name,code)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ]);
    setRequests((requestsRes.data as any[]) || []);

    if (agenciesRes.data) {
      setAgencies(agenciesRes.data as any);
      const totalMembers = agenciesRes.data.reduce((sum, a) => sum + (a.member_count || 0), 0);
      const totalPayouts = (payoutSumRes.data || []).reduce(
        (sum, p) => sum + Number(p.bdt_value || 0), 0
      );
      setStats({
        total: agenciesRes.data.length,
        members: totalMembers,
        payouts: totalPayouts,
      });
    }
    setLoading(false);
  }

  async function reviewRequest(request: JoinRequest, approve: boolean, agencyId?: string) {
    setActionBusy(request.id);
    const note = approve ? null : window.prompt('Optional rejection reason') || null;
    const { data, error } = await supabase.rpc('admin_review_agency_request', {
      p_request_id: request.id,
      p_approve: approve,
      p_agency_id: agencyId || request.agency_id,
      p_review_note: note,
    });
    setActionBusy(null);
    if (error || !data?.success) alert(data?.message || error?.message || 'Request update failed');
    else await fetchData();
  }

  async function searchUsers(value: string) {
    setUserQuery(value);
    const term = value.trim();
    if (term.length < 2) { setUserMatches([]); return; }
    let query = supabase.from('profiles').select('id,full_name,display_id,avatar_url,agency_id,is_banned').eq('is_banned', false).limit(10);
    query = /^\d+$/.test(term) ? query.eq('display_id', Number(term)) : query.ilike('full_name', `%${term}%`);
    const { data } = await query;
    setUserMatches(data || []);
  }

  async function assignUser(userId: string) {
    if (!assignAgency) return;
    setActionBusy(userId);
    const { data, error } = await supabase.rpc('admin_assign_agency_host', {
      p_user_id: userId, p_agency_id: assignAgency.id, p_request_id: null, p_review_note: 'Direct dashboard assignment',
    });
    setActionBusy(null);
    if (error || !data?.success) alert(data?.message || error?.message || 'Assignment failed');
    else { await openHostManager(assignAgency); setUserQuery(''); setUserMatches([]); await fetchData(); }
  }

  async function openHostManager(agency: Agency) {
    setAssignAgency(agency);
    const { data } = await supabase
      .from('agency_members')
      .select('host_id,status,joined_at,host:profiles!agency_members_host_id_fkey(full_name,display_id,avatar_url)')
      .eq('agency_id', agency.id)
      .in('status', ['active', 'leave_pending'])
      .order('joined_at', { ascending: false });
    setAgencyMembers((data as any[]) || []);
  }

  async function releaseUser(member: AgencyMember) {
    if (!window.confirm(`Release ${member.host?.full_name || 'this host'} from ${assignAgency?.name}?`)) return;
    setActionBusy(member.host_id);
    const reason = window.prompt('Optional release note') || null;
    const { data, error } = await supabase.rpc('admin_release_agency_host', {
      p_user_id: member.host_id, p_reason: reason,
    });
    setActionBusy(null);
    if (error || !data?.success) alert(data?.message || error?.message || 'Release failed');
    else if (assignAgency) { await openHostManager(assignAgency); await fetchData(); }
  }

  async function updateStatus(id: string, status: string) {
    const ok = window.confirm(`Set agency status to "${status}"?`);
    if (!ok) return;
    const { error } = await supabase.from('agencies').update({ status }).eq('id', id);
    if (!error) {
      setAgencies((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } else {
      alert('Update failed: ' + error.message);
    }
  }

  // Search has to be null-safe across all three fields:
  //   - name and code are normally NOT NULL, but FK joins can return
  //     partial rows during a backfill window.
  //   - owner.full_name is NULLABLE — a host can delete their account
  //     after creating an agency, leaving the agency owner record
  //     with a NULL profile join. The old code crashed in that case.
  //
  // Normalising every side through String() + lowercase, then a single
  // includes() check, makes the filter safe and case-insensitive.
  const q = (searchTerm || '').toLowerCase();
  const matches = (s: unknown) => String(s ?? '').toLowerCase().includes(q);
  const filtered = q === ''
    ? agencies
    : agencies.filter((a) =>
        matches(a.name) || matches(a.code) || matches(a.owner?.full_name)
      );

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      verified: 'bg-green-400/10 text-green-400',
      pending: 'bg-yellow-400/10 text-yellow-400',
      suspended: 'bg-red-400/10 text-red-400',
    };
    return map[status] || 'bg-gray-400/10 text-gray-400';
  };

  const colorFromName = (name: string) => {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-emerald-500', 'bg-cyan-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Agency Management</h2>
          <p className="text-gray-500 mt-1">Verify, suspend, and monitor official agencies.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search by name, code, owner..."
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 w-72"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all"
            onClick={fetchData}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Agencies', value: stats.total.toLocaleString(), icon: ShieldCheck, color: 'text-blue-400' },
          { label: 'Total Hosts (in agencies)', value: stats.members.toLocaleString(), icon: Users, color: 'text-green-400' },
          { label: 'Total Payouts Sent', value: `৳${stats.payouts.toLocaleString()}`, icon: TrendingUp, color: 'text-pink-400' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-6">
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-xl bg-white/5 ${stat.color}`}>
                <stat.icon size={24} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-black text-white mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-white">Host Applications</h3>
            <p className="text-xs text-gray-500">Only dashboard admins can approve agency membership.</p>
          </div>
          <span className="rounded-full bg-pink-500/15 text-pink-300 px-3 py-1 text-xs font-bold">{requests.length} pending</span>
        </div>
        {requests.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">No pending host applications.</p> : (
          <div className="divide-y divide-white/5">
            {requests.map((request) => (
              <div key={request.id} className="p-5 flex items-center gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center font-black text-white">{request.user?.full_name?.[0]?.toUpperCase() || 'U'}</div>
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold text-white">{request.user?.full_name || 'User'} <span className="font-mono text-[10px] text-gray-500">ID {request.user?.display_id}</span></p>
                  <p className="text-xs text-gray-400">Requests <b className="text-cyan-300">{request.agency?.name}</b> · {new Date(request.created_at).toLocaleString()}</p>
                  {request.applicant_note ? <p className="text-xs text-gray-500 mt-1">{request.applicant_note}</p> : null}
                </div>
                <select id={`agency-${request.id}`} defaultValue={request.agency_id} className="bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-xs text-white">
                  {agencies.filter(a => a.status === 'verified').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button disabled={actionBusy === request.id} onClick={() => {
                  const el = document.getElementById(`agency-${request.id}`) as HTMLSelectElement | null;
                  void reviewRequest(request, true, el?.value);
                }} className="px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-bold disabled:opacity-50">Approve</button>
                <button disabled={actionBusy === request.id} onClick={() => void reviewRequest(request, false)} className="px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 text-xs font-bold disabled:opacity-50">Reject</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black">Agency</th>
              <th className="px-6 py-4 font-black">Owner</th>
              <th className="px-6 py-4 font-black text-center">Hosts</th>
              <th className="px-6 py-4 font-black">Stock</th>
              <th className="px-6 py-4 font-black">Rate</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && agencies.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline mr-2" size={18} /> Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No agencies found.
                </td>
              </tr>
            ) : (
              filtered.map((agency) => (
                <tr key={agency.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${colorFromName(agency.name)} flex items-center justify-center font-bold text-lg`}>
                        {agency.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white">{agency.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{agency.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-300">{agency.owner?.full_name || '—'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{agency.owner?.display_id ? `ID: ${agency.owner.display_id}` : ''}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-white">{agency.member_count || 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[11px] text-yellow-400">🫘 {(agency.accumulated_beans || 0).toLocaleString()}</p>
                    <p className="text-[11px] text-cyan-400">💎 {(agency.diamond_balance || 0).toLocaleString()}</p>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-300">৳{agency.payout_rate}/100k</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${statusBadge(agency.status)}`}>
                      {agency.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {agency.status === 'verified' && (
                        <button className="p-2 hover:bg-cyan-400/10 rounded-lg text-gray-400 hover:text-cyan-400" onClick={() => void openHostManager(agency)} title="Manage hosts">
                          <UserPlus size={16} />
                        </button>
                      )}
                      {agency.status !== 'verified' && (
                        <button
                          className="p-2 hover:bg-green-400/10 rounded-lg text-gray-400 hover:text-green-400 transition-all"
                          onClick={() => updateStatus(agency.id, 'verified')}
                          title="Verify"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
                      {agency.status !== 'suspended' && (
                        <button
                          className="p-2 hover:bg-red-400/10 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                          onClick={() => updateStatus(agency.id, 'suspended')}
                          title="Suspend"
                        >
                          <Ban size={16} />
                        </button>
                      )}
                      {agency.status === 'suspended' && (
                        <button
                          className="p-2 hover:bg-yellow-400/10 rounded-lg text-gray-400 hover:text-yellow-400 transition-all"
                          onClick={() => updateStatus(agency.id, 'pending')}
                          title="Unsuspend (set pending)"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {assignAgency && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#1E1A34] border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4"><div><h3 className="text-xl font-black text-white">Manage hosts</h3><p className="text-xs text-gray-500">{assignAgency.name}</p></div><button onClick={() => setAssignAgency(null)}><X className="text-gray-400" /></button></div>
            {agencyMembers.length ? <div className="mb-5"><p className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2">Current hosts</p><div className="space-y-2 max-h-40 overflow-y-auto">{agencyMembers.map((member) => <div key={member.host_id} className="p-3 rounded-xl bg-white/5 flex items-center justify-between gap-3"><div><p className="text-sm text-white font-bold">{member.host?.full_name || 'Unknown user'}</p><p className="text-[11px] text-gray-500">ID {member.host?.display_id} {member.status === 'leave_pending' ? '· requested release' : ''}</p></div><button disabled={actionBusy === member.host_id} onClick={() => void releaseUser(member)} className="text-xs font-bold text-red-400 hover:text-red-300 disabled:opacity-40">Release</button></div>)}</div></div> : null}
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2">Add or transfer host</p>
            <input autoFocus value={userQuery} onChange={(e) => void searchUsers(e.target.value)} placeholder="Search name or exact user ID" className="w-full bg-[#0E111E] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-pink-500" />
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {userMatches.map((profile) => <button key={profile.id} disabled={actionBusy === profile.id} onClick={() => void assignUser(profile.id)} className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 flex justify-between disabled:opacity-50"><span className="text-white font-bold">{profile.full_name}</span><span className="text-xs text-gray-500">ID {profile.display_id}{profile.agency_id ? ' · transfer' : ''}</span></button>)}
              {userQuery.trim().length >= 2 && userMatches.length === 0 ? <p className="text-center text-sm text-gray-500 py-6">No eligible users found.</p> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
