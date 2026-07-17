"use client";

import { createContext, useContext } from 'react';
import { AdminPermissions, hasPermission, PermissionLevel } from './adminModules';

export type DashboardRole = 'super_admin' | 'admin' | 'manager' | 'moderator' | 'agency_owner';
export type AdminAccess = {
  id: string;
  fullName: string;
  role: DashboardRole;
  permissions: AdminPermissions;
  isActive: boolean;
};

const AdminAccessContext = createContext<AdminAccess | null>(null);

export function AdminAccessProvider({ value, children }: { value: AdminAccess; children: React.ReactNode }) {
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess() {
  const access = useContext(AdminAccessContext);
  const can = (moduleKey: string, required: PermissionLevel = 'view') =>
    hasPermission(access?.role, access?.permissions, moduleKey, required);
  return { access, can, loading: !access };
}
