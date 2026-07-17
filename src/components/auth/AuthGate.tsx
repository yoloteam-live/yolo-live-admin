"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AdminAccess, AdminAccessProvider, DashboardRole } from '@/lib/adminAccess';
import { ADMIN_MODULES, moduleForPath, hasPermission } from '@/lib/adminModules';

type AccessRpc = {
  success?: boolean;
  profile_id?: string;
  full_name?: string;
  role?: DashboardRole;
  permissions?: Record<string, 'view' | 'manage'>;
  is_active?: boolean;
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [access, setAccess] = useState<AdminAccess | null>(null);

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    let mounted = true;

    async function check() {
      let session: Session | null = null;
      try {
        const res = await supabase.auth.getSession();
        if (res.error) {
          // Stale/invalid refresh token — clear the bad session so we don't loop
          if (res.error.message?.toLowerCase().includes('refresh token')) {
            await supabase.auth.signOut().catch(() => {});
          }
        }
        session = res.data?.session ?? null;
      } catch (error: unknown) {
        if (error instanceof Error && error.message.toLowerCase().includes('refresh token')) {
          await supabase.auth.signOut().catch(() => {});
        }
      }

      if (!session) {
        if (mounted) {
          setAccess(null);
          setChecking(false);
          if (!isLoginPage) router.replace('/login');
        }
        return;
      }

      const { data, error } = await supabase.rpc('get_my_admin_access');
      let rpc = data as AccessRpc | null;

      // Keeps an existing super admin usable during the migration rollout.
      if (error) {
        const legacy = await supabase.from('profiles').select('id, full_name, role').eq('id', session.user.id).single();
        if (legacy.data && ['super_admin', 'admin'].includes(legacy.data.role)) {
          rpc = {
            success: true,
            profile_id: legacy.data.id,
            full_name: legacy.data.full_name,
            role: 'super_admin',
            permissions: {},
            is_active: true,
          };
        }
      }

      if (!rpc?.success || !rpc.profile_id || !rpc.role || rpc.is_active === false) {
        await supabase.auth.signOut().catch(() => {});
        if (mounted) {
          setAccess(null);
          setChecking(false);
          if (!isLoginPage) router.replace('/login');
        }
        return;
      }

      const nextAccess: AdminAccess = {
        id: rpc.profile_id,
        fullName: rpc.full_name || 'Admin',
        role: rpc.role,
        permissions: rpc.permissions || {},
        isActive: true,
      };

      if (mounted) {
        setAccess(nextAccess);
        setChecking(false);
        if (isLoginPage) {
          const first = ADMIN_MODULES.find((module) => hasPermission(nextAccess.role, nextAccess.permissions, module.key));
          router.replace(first?.href || '/');
        } else {
          const currentModule = moduleForPath(pathname);
          if (currentModule && !hasPermission(nextAccess.role, nextAccess.permissions, currentModule.key)) {
            const first = ADMIN_MODULES.find((module) => hasPermission(nextAccess.role, nextAccess.permissions, module.key));
            router.replace(first?.href || '/login');
          }
        }
      }
    }

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED with no session = refresh failed; treat as signed-out
      if (event === 'TOKEN_REFRESHED' && !session) {
        supabase.auth.signOut().catch(() => {});
      }
      if (!session && !isLoginPage) {
        router.replace('/login');
      } else {
        check();
      }
    });

    // Watch the signed-in admin's own profile row. If a super_admin
    // demotes them mid-session (role changed to 'user' / 'agency_owner'
    // / 'banned' set), this listener fires and signs them out
    // immediately instead of letting the cached JWT keep the admin
    // panel open until the token naturally expires (up to an hour).
    let roleSub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u?.id || !mounted) return;
        roleSub = supabase
          .channel(`adminRoleWatch:${u.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${u.id}` },
            (payload) => {
              const nextProfile = payload.new as { role?: string; is_banned?: boolean };
              const r = nextProfile.role;
              const banned = nextProfile.is_banned;
              if (banned || !['admin', 'super_admin', 'manager', 'moderator', 'agency_owner'].includes(r || '')) {
                supabase.auth.signOut().catch(() => {});
                router.replace('/login');
              }
            }
          )
          .subscribe();
      } catch {
        // Non-fatal; on next check() the stale role will be caught.
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (roleSub) { try { roleSub.unsubscribe(); } catch {} }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Login page: render children when no session, otherwise effect redirects
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0E111E] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-pink-500" size={40} />
          <p className="text-gray-500 text-sm">Verifying admin session…</p>
        </div>
      </div>
    );
  }

  if (!access) {
    return null; // redirecting
  }

  return <AdminAccessProvider value={access}>{children}</AdminAccessProvider>;
}
