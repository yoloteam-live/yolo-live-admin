"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
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
            // An active staff account can intentionally have every module
            // revoked. Keep its authenticated session alive and show the
            // no-access state below instead of bouncing / -> /login and
            // making the user appear to be automatically logged out.
            if (first) router.replace(first.href);
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

  const firstPermittedModule = ADMIN_MODULES.find((module) =>
    hasPermission(access.role, access.permissions, module.key),
  );

  if (!firstPermittedModule) {
    return (
      <AdminAccessProvider value={access}>
        <div className="min-h-screen bg-[#0E111E] flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/25 bg-[#1E1A34] p-7 text-center shadow-2xl">
            <ShieldAlert className="mx-auto mb-4 text-amber-400" size={44} />
            <h1 className="text-2xl font-black text-white">No dashboard modules assigned</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              {access.fullName}, your <span className="capitalize text-gray-200">{access.role.replace('_', ' ')}</span> account is active,
              but an administrator has not assigned any dashboard pages yet.
            </p>
            <p className="mt-2 text-xs text-gray-500">Ask a super admin to add module access from Staff Accounts.</p>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut().catch(() => {});
                router.replace('/login');
              }}
              className="mx-auto mt-6 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      </AdminAccessProvider>
    );
  }

  return <AdminAccessProvider value={access}>{children}</AdminAccessProvider>;
}
