"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// All roles that the admin panel cares about. `admin` is kept only as
// a fallback for any pre-migration-80 row that somehow survived; the
// CHECK constraint blocks new inserts.
export type AdminRole =
  | 'user'
  | 'host'
  | 'reseller'
  | 'agency_owner'
  | 'manager'
  | 'super_admin'
  | 'admin'
  | null;

export type UseAdminRole = {
  role: AdminRole;
  isSuperAdmin: boolean;
  isManager: boolean;
  loading: boolean;
};

// Single source of truth for the currently signed-in admin's role.
//
// Why this hook exists: every blocked page and every super-admin-only
// UI element needs the same answer ("am I super_admin?"), and the
// answer can change mid-session (a super_admin can demote a manager
// while they're using the panel). Polling on every page would thrash
// supabase; AuthGate already opens a realtime listener for sign-out,
// this mirrors that pattern so role-gated UI updates within ~200ms of
// the row change without reload.
export function useAdminRole(): UseAdminRole {
  const [role, setRole] = useState<AdminRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) {
          if (mounted) {
            setRole(null);
            setLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!mounted) return;
        if (error || !data) {
          setRole(null);
        } else {
          setRole(((data as { role?: string }).role ?? null) as AdminRole);
        }
        setLoading(false);

        // Subscribe to row updates so the role refresh is instant.
        // Random suffix avoids the supabase-js channel-cache reuse bug
        // (same pattern as Sidebar / AuthGate).
        const key = `useAdminRole:${user.id}:${Math.random().toString(36).slice(2, 8)}`;
        channel = supabase
          .channel(key)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
            (payload: { new: { role?: string } }) => {
              if (!mounted) return;
              const next = (payload.new?.role ?? null) as AdminRole;
              setRole(next);
            }
          )
          .subscribe();
      } catch (_) {
        if (mounted) {
          setRole(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      if (channel) {
        try { supabase.removeChannel(channel); } catch (_) {}
      }
    };
  }, []);

  return {
    role,
    isSuperAdmin: role === 'super_admin' || role === 'admin',
    isManager: role === 'manager',
    loading,
  };
}
