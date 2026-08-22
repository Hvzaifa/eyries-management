import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const USERS = [
  {
    email: 'admin@eyries.com',
    password: 'password123',
    role: 'admin',
  },
  {
    email: 'staff@eyries.com',
    password: 'password123',
    role: 'staff',
  },
  {
    email: 'viewer@eyries.com',
    password: 'password123',
    role: 'viewer',
  },
];

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL is not set in environment variables');
  }

  console.log('Connecting to PostgreSQL database to seed/sync Supabase Auth users...');
  const client = new Client({ connectionString });
  await client.connect();

  for (const u of USERS) {
    console.log(`Processing user: ${u.email} (${u.role})...`);

    // Check if user exists in auth.users
    const existing = await client.query('SELECT id FROM auth.users WHERE email = $1', [u.email]);

    let userId: string;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      console.log(`  Updating existing user ID: ${userId}`);
      await client.query(
        `UPDATE auth.users
         SET encrypted_password = crypt($1, gen_salt('bf')),
             email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
             raw_user_meta_data = $2::jsonb,
             raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email']),
             aud = 'authenticated',
             role = 'authenticated',
             updated_at = NOW()
         WHERE id = $3`,
        [u.password, JSON.stringify({ role: u.role }), userId]
      );
    } else {
      console.log(`  Creating new user in auth.users...`);
      const insertRes = await client.query(
        `INSERT INTO auth.users (
           instance_id,
           id,
           aud,
           role,
           email,
           encrypted_password,
           email_confirmed_at,
           raw_app_meta_data,
           raw_user_meta_data,
           created_at,
           updated_at,
           confirmation_token,
           recovery_token,
           email_change_token_new,
           email_change
         ) VALUES (
           '00000000-0000-0000-0000-000000000000',
           gen_random_uuid(),
           'authenticated',
           'authenticated',
           $1,
           crypt($2, gen_salt('bf')),
           NOW(),
           jsonb_build_object('provider', 'email', 'providers', array['email']),
           $3::jsonb,
           NOW(),
           NOW(),
           '',
           '',
           '',
           ''
         )
         RETURNING id`,
        [u.email, u.password, JSON.stringify({ role: u.role })]
      );
      userId = insertRes.rows[0].id;
    }

    // Ensure identity exists in auth.identities
    const existingIdentity = await client.query(
      'SELECT id FROM auth.identities WHERE user_id = $1 AND provider = $2',
      [userId, 'email']
    );

    if (existingIdentity.rows.length === 0) {
      console.log(`  Creating identity in auth.identities for ${u.email}...`);
      await client.query(
        `INSERT INTO auth.identities (
           id,
           user_id,
           identity_data,
           provider,
           provider_id,
           last_sign_in_at,
           created_at,
           updated_at
         ) VALUES (
           $1::uuid,
           $1::uuid,
           jsonb_build_object('sub', $1::text, 'email', $2::text),
           'email',
           $1::text,
           NOW(),
           NOW(),
           NOW()
         )`,
        [userId, u.email]
      );
    } else {
      await client.query(
        `UPDATE auth.identities
         SET identity_data = jsonb_build_object('sub', $1::text, 'email', $2::text),
             updated_at = NOW()
         WHERE user_id = $1::uuid AND provider = 'email'`,
        [userId, u.email]
      );
    }

    console.log(`  ✓ ${u.email} ready with role '${u.role}' and password '${u.password}'`);
  }

  await client.end();
  console.log('\nAll sample users created and verified successfully!');
}

main().catch((err) => {
  console.error('Seeding sample users failed:', err);
  process.exit(1);
});
