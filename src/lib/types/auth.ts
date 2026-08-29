import type { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'staff' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export function getUserRole(user: User | null): UserRole {
  if (!user) return 'viewer';
  // app_metadata is set securely by the server/service role key and cannot be modified by the client.
  const appRole = user.app_metadata?.role as UserRole | undefined;
  if (appRole === 'admin' || appRole === 'staff' || appRole === 'viewer') {
    return appRole;
  }
  // Fallback to user_metadata for backward compatibility with existing accounts
  const userRole = user.user_metadata?.role as UserRole | undefined;
  if (userRole === 'admin' || userRole === 'staff' || userRole === 'viewer') {
    return userRole;
  }
  return 'viewer';
}

export function canEdit(role: UserRole): boolean {
  return role === 'admin' || role === 'staff';
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

export function isStaff(role: UserRole): boolean {
  return role === 'staff';
}

export function isViewer(role: UserRole): boolean {
  return role === 'viewer';
}
