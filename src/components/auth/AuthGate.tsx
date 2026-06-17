"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AdminProfile = { id: string; full_name: string; role: string };

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    let mounted = true;

    async function check() {
      let session: any = null;
      try {
        const res = await supabase.auth.getSession();
        if (res.error) {
          // Stale/invalid refresh token — clear the bad session so we don't loop
          if (res.error.message?.toLowerCase().includes('refresh token')) {
            await supabase.auth.signOut().catch(() => {});
          }
        }
        session = res.data?.session ?? null;
      } catch (e: any) {
        if (e?.message?.toLowerCase().includes('refresh token')) {
          await supabase.auth.signOut().catch(() => {});
        }
      }

      if (!session) {
        if (mounted) {
          setProfile(null);
          setChecking(false);
          if (!isLoginPage) router.replace('/login');
        }
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', session.user.id)
        .single();

      if (error || !data || !['admin', 'super_admin', 'manager'].includes(data.role)) {
        await supabase.auth.signOut().catch(() => {});
        if (mounted) {
          setProfile(null);
          setChecking(false);
          if (!isLoginPage) router.replace('/login');
        }
        return;
      }

      if (mounted) {
        setProfile(data as AdminProfile);
        setChecking(false);
        if (isLoginPage) router.replace('/');
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
              const r = (payload.new as any)?.role;
              const banned = (payload.new as any)?.is_banned;
              if (banned || !['admin', 'super_admin', 'manager'].includes(r)) {
                supabase.auth.signOut().catch(() => {});
                router.replace('/login');
              }
            }
          )
          .subscribe();
      } catch (_) {
        // Non-fatal; on next check() the stale role will be caught.
      }
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (roleSub) { try { roleSub.unsubscribe(); } catch (_) {} }
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

  if (!profile) {
    return null; // redirecting
  }

  return <>{children}</>;
}