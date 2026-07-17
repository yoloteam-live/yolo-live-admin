export type PermissionLevel = 'view' | 'manage';
export type AdminPermissions = Record<string, PermissionLevel>;

export type AdminModule = {
  key: string;
  name: string;
  href: string;
};

export const ADMIN_MODULES: AdminModule[] = [
  { key: 'overview', name: 'Overview', href: '/' },
  { key: 'messages', name: 'Messages', href: '/messages' },
  { key: 'users', name: 'Users', href: '/users' },
  { key: 'applications', name: 'Applications', href: '/applications' },
  { key: 'reports', name: 'User Reports', href: '/reports' },
  { key: 'topups', name: 'Top-Up Approvals', href: '/topups' },
  { key: 'agency_stock_requests', name: 'Agency Stock Requests', href: '/stock-requests' },
  { key: 'reseller_stock_requests', name: 'Reseller Stock Requests', href: '/reseller-stock-requests' },
  { key: 'live_rooms', name: 'Live Rooms', href: '/live-rooms' },
  { key: 'game_control', name: 'Game Control', href: '/games' },
  { key: 'game_history', name: 'Game History', href: '/game-history' },
  { key: 'gifts', name: 'Gifts Catalog', href: '/gifts' },
  { key: 'audio_templates', name: 'Audio Templates', href: '/audio-templates' },
  { key: 'mall_intros', name: 'Mall Intros', href: '/mall-intros' },
  { key: 'profile_frames', name: 'Profile Frames', href: '/profile-frames' },
  { key: 'vip_subscriptions', name: 'VIP Subscriptions', href: '/vip-subscriptions' },
  { key: 'svip_subscriptions', name: 'SVIP Subscriptions', href: '/svip-subscriptions' },
  { key: 'vip_tiers', name: 'VIP Tiers', href: '/vip-tiers' },
  { key: 'content', name: 'Content & Progression', href: '/content' },
  { key: 'splash', name: 'Splash Manager', href: '/splash' },
  { key: 'banners', name: 'Home Banners', href: '/banners' },
  { key: 'music', name: 'Music Library', href: '/music' },
  { key: 'agencies', name: 'Agencies', href: '/agencies' },
  { key: 'resellers', name: 'Resellers', href: '/resellers' },
  { key: 'transactions', name: 'Transactions', href: '/transactions' },
  { key: 'earnings', name: 'Earnings', href: '/earnings' },
  { key: 'analytics', name: 'Analytics', href: '/analytics' },
  { key: 'error_logs', name: 'Error Logs', href: '/error-logs' },
  { key: 'deleted_accounts', name: 'Deleted Accounts', href: '/deleted-accounts' },
  { key: 'staff_accounts', name: 'Staff Accounts', href: '/managers' },
  { key: 'settings', name: 'Settings', href: '/settings' },
];

export function moduleForPath(pathname: string) {
  return [...ADMIN_MODULES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((module) => module.href === '/' ? pathname === '/' : pathname === module.href || pathname.startsWith(`${module.href}/`));
}

export function hasPermission(
  role: string | null | undefined,
  permissions: AdminPermissions | null | undefined,
  moduleKey: string,
  required: PermissionLevel = 'view',
) {
  if (role === 'super_admin') return true;
  const level = permissions?.[moduleKey];
  return level === 'manage' || (required === 'view' && level === 'view');
}
