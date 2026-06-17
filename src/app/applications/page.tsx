"use client";
import { useState, useEffect } from 'react';
import {
  Search, Loader2, CheckCircle2, XCircle, Clock, RefreshCw, ExternalLink,
  ShieldCheck, Store, MessageSquare,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ResellerApp = {
  id: string;
  user_id: string;
  business_name: string;
  contact_link: string;
  payment_methods: string | null;
  nid_number: string | null;
  notes: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
  user?: { full_name: string; display_id: number; phone_number: string };
};

type AgencyApp = {
  id: string;
  user_id: string;
  proposed_name: string;
  proposed_code: string;
  contact_link: string;
  nid_number: string | null;
  notes: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
  user?: { full_name: string; display_id: number; phone_number: string };
};

const STATUSES = ['pending', 'approved', 'rejected', 'all'];

export default function ApplicationsPage() {
  const [tab, setTab] = useState<'reseller' | 'agency'>('reseller');
  const [resellerApps, setResellerApps] = useState<ResellerApp[]>([]);
  const [agencyApps, setAgencyApps] = useState<AgencyApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentAdminId(data.user.id);
    });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [statusFilter]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-applications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reseller_applications' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agency_applications' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAll() {
    setLoading(true);
    let rq = supabase
      .from('reseller_applications')
      .select('*, user:profiles!reseller_applications_user_id_fkey(full_name, display_id, phone_number)')
      .order('created_at', { ascending: false })
      .limit(100);
    let aq = supabase
      .from('agency_applications')
      .select('*, user:profiles!agency_applications_user_id_fkey(full_name, display_id, phone_number)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') {
      rq = rq.eq('status', statusFilter);
      aq = aq.eq('status', statusFilter);
    }

    const [rRes, aRes] = await Promise.all([rq, aq]);
    if (rRes.data) setResellerApps(rRes.data as any);
    if (aRes.data) setAgencyApps(aRes.data as any);
    setLoading(false);
  }

  async function approveReseller(id: string) {
    if (!currentAdminId) return;
    const notes = window.prompt('Optional review notes (leave blank to skip):') || null;
    setActionLoading(id);
    const { data, error } = await supabase.rpc('approve_reseller_application', {
      p_application_id: id,
      p_admin_id: currentAdminId,
      p_review_notes: notes,
    });
    setActionLoading(null);
    if (error) return alert('Error: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');
    alert('Reseller approved and added to active resellers.');
    fetchAll();
  }

  async function approveAgency(id: string) {
    if (!currentAdminId) return;
    const notes = window.prompt('Optional review notes (leave blank to skip):') || null;
    setActionLoading(id);
    const { data, error } = await supabase.rpc('approve_agency_application', {
      p_application_id: id,
      p_admin_id: currentAdminId,
      p_review_notes: notes,
    });
    setActionLoading(null);
    if (error) return alert('Error: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');
    alert('Agency approved and created.');
    fetchAll();
  }

  async function reject(id: string, kind: 'reseller' | 'agency') {
    if (!currentAdminId) return;
    const notes = window.prompt('Rejection reason (will be visible to applicant):');
    if (!notes) return;
    setActionLoading(id);
    const { data, error } = await supabase.rpc('reject_application', {
      p_application_id: id,
      p_admin_id: currentAdminId,
      p_kind: kind,
      p_review_notes: notes,
    });
    setActionLoading(null);
    if (error) return alert('Error: ' + error.message);
    if (!data?.success) return alert(data?.message || 'Failed');
    fetchAll();
  }

  const statusBadge = (s: string) => ({
    pending:  'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    approved: 'bg-green-400/10 text-green-400 border-green-400/20',
    rejected: 'bg-red-400/10 text-red-400 border-red-400/20',
  } as any)[s] || 'bg-gray-400/10 text-gray-400';

  const resellerFiltered = resellerApps.filter((a) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      a.business_name?.toLowerCase().includes(s) ||
      a.user?.full_name?.toLowerCase().includes(s) ||
      a.user?.phone_number?.includes(s)
    );
  });
  const agencyFiltered = agencyApps.filter((a) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      a.proposed_name?.toLowerCase().includes(s) ||
      a.proposed_code?.toLowerCase().includes(s) ||
      a.user?.full_name?.toLowerCase().includes(s) ||
      a.user?.phone_number?.includes(s)
    );
  });

  const pendingResellerCount = resellerApps.filter((a) => a.status === 'pending').length;
  const pendingAgencyCount = agencyApps.filter((a) => a.status === 'pending').length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Applications</h2>
          <p className="text-gray-500 mt-1">Review and approve reseller / agency applications.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search…"
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-[#1E1A34] border border-[#251B45] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>)}
          </select>
          <button className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all" onClick={fetchAll}>
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/5">
        <button
          onClick={() => setTab('reseller')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 ${
            tab === 'reseller' ? 'border-pink-500 text-white' : 'border-transparent text-gray-500 hover:text-white'
          }`}
        >
          <Store size={16} /> Reseller Apps
          {pendingResellerCount > 0 && (
            <span className="bg-yellow-400/20 text-yellow-400 text-[10px] font-black px-2 py-0.5 rounded-full">
              {pendingResellerCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('agency')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 ${
            tab === 'agency' ? 'border-pink-500 text-white' : 'border-transparent text-gray-500 hover:text-white'
          }`}
        >
          <ShieldCheck size={16} /> Agency Apps
          {pendingAgencyCount > 0 && (
            <span className="bg-yellow-400/20 text-yellow-400 text-[10px] font-black px-2 py-0.5 rounded-full">
              {pendingAgencyCount}
            </span>
          )}
        </button>
      </div>

      {loading && (resellerApps.length === 0 && agencyApps.length === 0) ? (
        <div className="text-center py-16 text-gray-500">
          <Loader2 className="animate-spin inline mr-2" size={18} /> Loading…
        </div>
      ) : tab === 'reseller' ? (
        <div className="space-y-4">
          {resellerFiltered.length === 0 ? (
            <div className="text-center py-16 text-gray-500">No reseller applications.</div>
          ) : resellerFiltered.map((a) => (
            <div key={a.id} className="glass-card p-6">
              <div className="flex justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center font-bold text-pink-400">
                      {a.business_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">{a.business_name}</h3>
                      <p className="text-xs text-gray-500">
                        by {a.user?.full_name} • ID: {a.user?.display_id} • {a.user?.phone_number}
                      </p>
                    </div>
                    <span className={`ml-auto px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${statusBadge(a.status)}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <a href={a.contact_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                      <MessageSquare size={14} /> {a.contact_link} <ExternalLink size={10} />
                    </a>
                    {a.payment_methods && <p className="text-gray-300"><span className="text-gray-500">Payment:</span> {a.payment_methods}</p>}
                    {a.nid_number && <p className="text-gray-300"><span className="text-gray-500">NID:</span> {a.nid_number}</p>}
                    <p className="text-gray-500 text-xs">Applied: {new Date(a.created_at).toLocaleString()}</p>
                  </div>
                  {a.notes && <p className="text-sm text-gray-400 mt-3 border-l-2 border-white/10 pl-3">{a.notes}</p>}
                  {a.review_notes && (
                    <p className="text-xs text-yellow-400 mt-3 border-l-2 border-yellow-400/30 pl-3">
                      Review note: {a.review_notes}
                    </p>
                  )}
                </div>
                {a.status === 'pending' && (
                  <div className="flex gap-2 flex-col">
                    <button
                      onClick={() => approveReseller(a.id)}
                      disabled={actionLoading === a.id}
                      className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {actionLoading === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Approve
                    </button>
                    <button
                      onClick={() => reject(a.id, 'reseller')}
                      disabled={actionLoading === a.id}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {agencyFiltered.length === 0 ? (
            <div className="text-center py-16 text-gray-500">No agency applications.</div>
          ) : agencyFiltered.map((a) => (
            <div key={a.id} className="glass-card p-6">
              <div className="flex justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center font-bold text-purple-400">
                      {a.proposed_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">{a.proposed_name}</h3>
                      <p className="text-xs text-gray-500">
                        Code: <span className="font-mono text-purple-400">{a.proposed_code}</span> • by {a.user?.full_name} • {a.user?.phone_number}
                      </p>
                    </div>
                    <span className={`ml-auto px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${statusBadge(a.status)}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <a href={a.contact_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                      <MessageSquare size={14} /> {a.contact_link} <ExternalLink size={10} />
                    </a>
                    {a.nid_number && <p className="text-gray-300"><span className="text-gray-500">NID:</span> {a.nid_number}</p>}
                    <p className="text-gray-500 text-xs col-span-2">Applied: {new Date(a.created_at).toLocaleString()}</p>
                  </div>
                  {a.notes && <p className="text-sm text-gray-400 mt-3 border-l-2 border-white/10 pl-3">{a.notes}</p>}
                  {a.review_notes && (
                    <p className="text-xs text-yellow-400 mt-3 border-l-2 border-yellow-400/30 pl-3">
                      Review note: {a.review_notes}
                    </p>
                  )}
                </div>
                {a.status === 'pending' && (
                  <div className="flex gap-2 flex-col">
                    <button
                      onClick={() => approveAgency(a.id)}
                      disabled={actionLoading === a.id}
                      className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {actionLoading === a.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Approve
                    </button>
                    <button
                      onClick={() => reject(a.id, 'agency')}
                      disabled={actionLoading === a.id}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}