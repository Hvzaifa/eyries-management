import { getUserRole, canEdit, isAdmin, isStaff, isViewer } from '../src/lib/types/auth';
import type { User } from '@supabase/supabase-js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log('--- Testing Auth Role Logic ---');

// Test 1: Null user returns 'viewer' default
assert(getUserRole(null) === 'viewer', 'Null user defaults to viewer role');

// Test 2: User with no metadata defaults to 'viewer'
const userWithoutMeta = { id: '1', email: 'test@example.com' } as User;
assert(getUserRole(userWithoutMeta) === 'viewer', 'User without metadata defaults to viewer');

// Test 3: User with admin metadata in app_metadata returns 'admin'
const adminUser = {
  id: '2',
  email: 'admin@example.com',
  app_metadata: { role: 'admin' },
} as unknown as User;
assert(getUserRole(adminUser) === 'admin', 'Admin user returns admin role from app_metadata');
assert(isAdmin('admin'), 'isAdmin returns true for admin');
assert(canEdit('admin'), 'canEdit returns true for admin');

// Test 3b: app_metadata overrides user_metadata if attacker tries to tamper
const spoofedUser = {
  id: '2b',
  email: 'viewer@example.com',
  app_metadata: { role: 'viewer' },
  user_metadata: { role: 'admin' },
} as unknown as User;
assert(getUserRole(spoofedUser) === 'viewer', 'app_metadata overrides spoofed user_metadata');

// Test 4: User with staff metadata in app_metadata returns 'staff'
const staffUser = {
  id: '3',
  email: 'staff@example.com',
  app_metadata: { role: 'staff' },
} as unknown as User;
assert(getUserRole(staffUser) === 'staff', 'Staff user returns staff role from app_metadata');
assert(isStaff('staff'), 'isStaff returns true for staff');
assert(canEdit('staff'), 'canEdit returns true for staff');
assert(!isAdmin('staff'), 'isAdmin returns false for staff');

// Test 5: User with viewer metadata returns 'viewer'
const viewerUser = {
  id: '4',
  email: 'viewer@example.com',
  app_metadata: { role: 'viewer' },
} as unknown as User;
assert(getUserRole(viewerUser) === 'viewer', 'Viewer user returns viewer role');
assert(isViewer('viewer'), 'isViewer returns true for viewer');
assert(!canEdit('viewer'), 'canEdit returns false for viewer (blocks editing)');
assert(!isAdmin('viewer'), 'isAdmin returns false for viewer');

console.log('\nAll auth role tests passed successfully!');
