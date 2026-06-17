"use client";
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { ScrollText, Loader2, ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';

type ProfileLite = {
  id: string;
  full_name: string | null;
  display_id: number | null;
  role: string;
};

type AuditRow = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  created_at: string;
};

export default function ManagerAuditPage() {
  // useParams keeps this a plain client component without needing to
  // await the Next 16 params Promise (which `React.use()` does for the
  // server-component variant).
  const params = useParams<{ id: string }>();
  const managerId = params?.id ?? '';

  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!managerId) return;
    setLoading(true);
    const [profRes, auditRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, display_id, role')
        .eq('id', managerId)
        .single(),
      supabase
        .from('admin_audit_log')
        .select('id, action, target_type, target_id, payload, created_at')
        .eq('admin_id', managerId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (profRes.error) console.warn('manager profile:', profRes.error.message);
    if (auditRes.error) console.warn('manager audit:', auditRes.error.message);
    setProfile((profRes.data as ProfileLite) || null);
    setRows((auditRes.data as AuditRow[]) || []);
    setLoading(false);
  }, [managerId]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
  }, [isSuperAdmin, load]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (roleLoading || !isSuperAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/managers"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition"
        >
          <ChevronLeft size={16} /> Back to managers
        </Link>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3">
          <ScrollText size={22} className="text-amber-300" />
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-white truncate">
              {profile?.full_name || 'Unknown manager'}
            </h2>
            <p className="text-xs text-gray-500 font-mono">
              ID {profile?.display_id ?? '—'} ·{' '}
              <span className="uppercase">{profile?.role || '—'}</span>
            </p>
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-2">
          Latest 100 actions this manager performed via admin RPCs. Every entry
          is permanent and audit-only.
        </p>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black w-44">Timestamp</th>
              <th className="px-6 py-4 font-black">Action</th>
              <th className="px-6 py-4 font-black">Target</th>
              <th className="px-6 py-4 font-black">Payload</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="animate-spin inline-block" size={20} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No audit-logged actions yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isOpen = expanded.has(r.id);
                const payloadStr = r.payload == null
                  ? '—'
                  : JSON.stringify(r.payload, null, 2);
                return (
                  <tr key={r.id} className="border-b border-white/5 align-top">
                    <td className="px-6 py-4 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-white">{r.action}</td>
                    <td className="px-6 py-4 text-gray-300 text-xs">
                      <div>{r.target_type || '—'}</div>
                      <div className="font-mono text-[10px] text-gray-500 truncate max-w-[180px]">
                        {r.target_id || ''}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggle(r.id)}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
                      >
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {isOpen ? 'Hide' : 'Show'} JSON
                      </button>
                      {isOpen && (
                        <pre className="mt-2 bg-black/40 border border-[#251B45] rounded-lg p-3 text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-words max-w-xl">
                          {payloadStr}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
