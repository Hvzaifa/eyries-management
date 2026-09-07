import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

/**
 * Account definitions. Passwords come ONLY from the environment.
 *
 * These used to carry hardcoded fallbacks (`... || 'Eyries@HQ2026'`), which
 * meant a working password for the head-office account — the account that can
 * refund EMDs and email airlines — was published in the repository for anyone
 * with read access to try. Anyone who ran the seed without setting the env vars
 * got exactly those passwords, and nothing ever told them so.
 *
 * CLAUDE.md rule 8: secrets always come from environment variables, never
 * hardcoded. A missing password now stops the script instead of quietly
 * substituting a public one.
 */
const USERS = [
  {
    email: 'headoffice@eyries.local',
    passwordEnv: 'SEED_HQ_PASSWORD',
    app_metadata: { account_type: 'headoffice' },
  },
  {
    email: 'rawalpindi@eyries.local',
    passwordEnv: 'SEED_RWP_PASSWORD',
    app_metadata: { account_type: 'branch', branch_name: 'Rawalpindi' },
  },
  {
    email: 'islamabad@eyries.local',
    passwordEnv: 'SEED_ISB_PASSWORD',
    app_metadata: { account_type: 'branch', branch_name: 'Islamabad' },
  },
  {
    email: 'lahore@eyries.local',
    passwordEnv: 'SEED_LHR_PASSWORD',
    app_metadata: { account_type: 'branch', branch_name: 'Lahore' },
  },
  {
    email: 'karachi@eyries.local',
    passwordEnv: 'SEED_KHI_PASSWORD',
    app_metadata: { account_type: 'branch', branch_name: 'Karachi' },
  },
];

/** Minimum length Supabase Auth itself enforces — caught here with a clearer message. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Resolve every password up front and refuse the whole run if any is missing or
 * too short. Failing before the first account is touched keeps the script
 * all-or-nothing, rather than creating half the users and then stopping.
 */
function resolvePasswords(): Map<string, string> {
  const resolved = new Map<string, string>();
  const missing: string[] = [];
  const tooShort: string[] = [];

  for (const u of USERS) {
    const value = process.env[u.passwordEnv];
    if (!value) {
      missing.push(`  ${u.passwordEnv}   (${u.email})`);
    } else if (value.length < MIN_PASSWORD_LENGTH) {
      tooShort.push(`  ${u.passwordEnv}   (${u.email}) — ${value.length} chars`);
    } else {
      resolved.set(u.email, value);
    }
  }

  if (missing.length > 0 || tooShort.length > 0) {
    const parts = ['Refusing to seed users.\n'];
    if (missing.length > 0) {
      parts.push(`These passwords are not set in the environment:\n${missing.join('\n')}\n`);
    }
    if (tooShort.length > 0) {
      parts.push(
        `These are shorter than ${MIN_PASSWORD_LENGTH} characters:\n${tooShort.join('\n')}\n`
      );
    }
    parts.push(
      `\nSet them in .env (which is gitignored) before running this script, e.g.\n` +
      `  SEED_HQ_PASSWORD=<a long random password>\n\n` +
      `There are deliberately no defaults: a password written into this file would ` +
      `be a published credential for a real account.`
    );
    throw new Error(parts.join('\n'));
  }

  return resolved;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env\n' +
      'Find the service role key in Supabase Dashboard -> Project Settings -> API.'
    );
  }

  // Resolve (and validate) every password before touching Supabase at all.
  const passwords = resolvePasswords();

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Every branch account's branch_name must match a row in `branches`. An account
  // whose branch does not resolve is refused access to everything by design, so
  // creating one silently would just produce a user who can log in and see an
  // empty system with no explanation. Fail here instead, before the account exists.
  const prisma = new PrismaClient();
  try {
    const branches = await prisma.branch.findMany({ select: { name: true } });
    const known = new Set(branches.map((b) => b.name.toLowerCase()));
    const unknown = USERS.filter(
      (u) => u.app_metadata.account_type === 'branch' &&
        !known.has(String(u.app_metadata.branch_name ?? '').toLowerCase())
    );
    if (unknown.length > 0) {
      throw new Error(
        `These accounts name a branch that does not exist in the branches table:\n` +
        unknown.map((u) => `  ${u.email} -> "${u.app_metadata.branch_name}"`).join('\n') +
        `\n\nKnown branches: ${branches.map((b) => b.name).sort().join(', ')}\n` +
        `Add the branch (npm run db:seed) or correct branch_name in this script — ` +
        `do not invent a branch that the business does not have.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  for (const u of USERS) {
    console.log(`Processing user: ${u.email}...`);

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: passwords.get(u.email)!,
      email_confirm: true,
      app_metadata: u.app_metadata,
    });

    if (!createError) {
      console.log(`  Created user ${created.user.id}`);
      continue;
    }

    if (!/already/i.test(createError.message)) {
      throw createError;
    }

    // User exists — reset password and app_metadata so the script stays idempotent.
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = listData.users.find((x) => x.email === u.email);
    if (!existing) {
      throw new Error(`Supabase says ${u.email} already exists but could not find it in listUsers.`);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password: passwords.get(u.email)!,
      app_metadata: u.app_metadata,
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
