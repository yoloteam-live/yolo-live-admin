"use client";
import { moduleForPath } from './adminModules';
import { usePathname } from 'next/navigation';
import { useAdminAccess } from './adminAccess';

// All roles that the admin panel cares about. `admin` is kept only as
// a fallback for any pre-migration-80 row that somehow survived; the
// CHECK constraint blocks new inserts.
export type AdminRole =
  | 'user'
  | 'host'
  | 'reseller'
  | 'agency_owner'
  | 'manager'
  | 'moderator'
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
  const pathname = usePathname();
  const { access, can, loading } = useAdminAccess();
  const currentModule = moduleForPath(pathname);
  const canManageCurrent = currentModule ? can(currentModule.key, 'manage') : access?.role === 'super_admin';

  return {
    role: access?.role ?? null,
    // Legacy pages use this flag as their write-access gate. It now maps
    // to Manage permission for the current module.
    isSuperAdmin: access?.role === 'super_admin' || canManageCurrent,
    isManager: access?.role === 'manager',
    loading,
  };
}
