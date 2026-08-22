import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const USERS = [
  { email: 'admin@eyries.com', password: 'password123', role: 'admin' },
  { email: 'staff@eyries.com', password: 'password123', role: 'staff' },
  { email: 'viewer@eyries.com', password: 'password123', role: 'viewer' },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env\n' +
      'Find the service role key in Supabase Dashboard -> Project Settings -> API.'
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const u of USERS) {
    console.log(`Processing user: ${u.email} (${u.role})...`);

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { role: u.role },
    });

    if (!createError) {
      console.log(`  Created user ${created.user.id}`);
      continue;
    }

    if (!/already/i.test(createError.message)) {
      throw createError;
    }

    // User exists — reset password and role metadata so the script stays idempotent.
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = listData.users.find((x) => x.email === u.email);
    if (!existing) {
      throw new Error(`Supabase says ${u.email} already exists but could not find it in listUsers.`);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password: u.password,
      user_metadata: { role: u.role },
    });
    if (updateError) throw updateError;

    console.log(`  Updated existing user ${existing.id}`);
  }

  console.log('\nAll sample users ready.');
}

main().catch((err) => {
  console.error('Seeding sample users failed:', err);
  process.exit(1);
});
