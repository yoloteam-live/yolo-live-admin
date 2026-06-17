"use client";
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Diamond,
  BarChart3,
  Settings,
  ShieldCheck,
  TrendingUp,
  Gamepad2,
  Wallet,
  LogOut,
  Inbox,
  Package,
  Store,
  Music,
  MessageSquare,
  Gift,
  ShieldAlert,
  Radio,
  Trophy,
  Sparkles,
  Crown,
  Bug,
  UserX,
  Image as ImageIcon,
  GalleryHorizontal,
  UserCog,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '@/lib/supabase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// `superOnly: true` hides the item from the manager role. Mirrors the
// route-level guard added to each blocked page so a manager who pastes
// the URL still gets redirected.
type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  badgeKey?: string;
  superOnly?: boolean;
};

const navItems: NavItem[] = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Messages', href: '/messages', icon: MessageSquare, badgeKey: 'unread_dms' },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Applications', href: '/applications', icon: Inbox },
  { name: 'User Reports', href: '/reports', icon: ShieldAlert, badgeKey: 'pending_reports' },
  { name: 'Top-Up Approvals', href: '/topups', icon: Wallet },
  { name: 'Agency Stock Requests', href: '/stock-requests', icon: Package },
  { name: 'Reseller Stock Requests', href: '/reseller-stock-requests', icon: Package },
  { name: 'Live Rooms', href: '/live-rooms', icon: Radio },
  { name: 'Game Control', href: '/games', icon: Gamepad2, superOnly: true },
  { name: 'Game History', href: '/game-history', icon: Trophy },
  { name: 'Gifts Catalog', href: '/gifts', icon: Gift, superOnly: true },
  { name: 'Audio Templates', href: '/audio-templates', icon: ImageIcon, superOnly: true },
  { name: 'VIP Tiers', href: '/vip-tiers', icon: Crown, superOnly: true },
  { name: 'Content & Progression', href: '/content', icon: Sparkles, superOnly: true },
  { name: 'Splash Manager', href: '/splash', icon: ImageIcon },
  { name: 'Home Banners', href: '/banners', icon: GalleryHorizontal },
  { name: 'Music Library', href: '/music', icon: Music, superOnly: true },
  { name: 'Agencies', href: '/agencies', icon: ShieldCheck },
  { name: 'Resellers', href: '/resellers', icon: Store },
  { name: 'Transactions', href: '/transactions', icon: Diamond, superOnly: true },
  { name: 'Earnings', href: '/earnings', icon: TrendingUp },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Error Logs', href: '/error-logs', icon: Bug, superOnly: true },
  { name: 'Deleted Accounts', href: '/deleted-accounts', icon: UserX, superOnly: true },
  { name: 'Managers', href: '/managers', icon: UserCog, superOnly: true },
  { name: 'Settings', href: '/settings', icon: Settings, superOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [unreadDms, setUnreadDms] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (mounted) setAdminId(session.user.id);
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single();
      if (mounted && data) setProfile(data as any);
    })();
    return () => { mounted = false; };
  }, []);

  // Unread DM count for the Messages nav badge.
  useEffect(() => {
    if (!adminId) return;
    const loadCount = async () => {
      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', adminId)
        .eq('is_read', false);
      setUnreadDms(count || 0);
    };
    loadCount();

    // Debounce so a host posting 10 messages in 2 seconds = 1 COUNT
    // query, not 10. The exact unread number is fine to lag by ~400ms
    // — admins glance at this badge, they don't watch it tick.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadCount, 400);
    };

    // Per-mount random suffix because supabase-js caches channels by
    // name — a re-mount with a stable name returns the previously-
    // subscribed instance and any new `.on()` call throws "cannot add
    // callbacks after subscribe()". The cleanup `removeChannel` below
    // disposes the instance, so a fresh suffix per mount gives a clean
    // slate without leaking zombie channels.
    // Server-side filter narrows the firehose down to messages
    // actually addressed to this admin — previously every chat in
    // the entire platform triggered a refetch.
    const channelKey = `admin-sidebar-unread-${adminId}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase
      .channel(channelKey)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `receiver_id=eq.${adminId}` },
        scheduleLoad
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      try { supabase.removeChannel(ch); } catch (_) {}
    };
  }, [adminId]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <aside className="w-64 h-full bg-[#1E1A34] border-r border-[#251B45] flex flex-col">
      <div className="p-6">
        <h1 className="text-2xl font-black gradient-text">YOLO ADMIN</h1>
        <p className="text-[10px] text-gray-500 font-bold tracking-widest mt-1">
          {profile?.role === 'manager' ? 'MANAGER PANEL' : 'SUPER ADMIN PANEL'}
        </p>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          // Hide super-only items from managers. We treat `admin` as a
          // legacy alias for super_admin (see migration 80).
          const isSuperAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';
          if (item.superOnly && !isSuperAdmin) return null;
          const isActive = pathname === item.href;
          const badge = item.badgeKey === 'unread_dms' ? unreadDms : 0;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-[#FF2E7E] text-white shadow-lg shadow-pink-500/20"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon size={20} />
              <span className="flex-1">{item.name}</span>
              {badge > 0 && (
                <span className={cn(
                  "text-[10px] font-bold rounded-full min-w-[20px] h-[20px] px-1.5 flex items-center justify-center",
                  isActive ? "bg-white text-pink-600" : "bg-pink-500 text-white"
                )}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#251B45]">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/20 mb-2">
          <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center font-bold text-xs">
            {profile?.full_name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate text-white">
              {profile?.full_name || 'Admin'}
            </p>
            <p className="text-[10px] text-gray-500 truncate uppercase">
              {profile?.role?.replace('_', ' ') || ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}