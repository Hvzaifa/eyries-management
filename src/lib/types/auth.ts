import type { User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'staff' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export function getUserRole(user: User | null): UserRole {
  if (!user) return 'viewer';
  const role = user.user_metadata?.role as UserRole | undefined;
  if (role === 'admin' || role === 'staff' || role === 'viewer') {
    return role;
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
