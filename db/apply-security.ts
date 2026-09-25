/**
 * Applies db/apply-security.sql to the database.
 *
 *   npx tsx db/apply-security.ts            (dry run — applies, verifies, ROLLS BACK)
 *   npx tsx db/apply-security.ts --commit   (applies for real)
 *
 * Exists because the project has no psql dependency. Runs inside one
 * transaction and verifies the application can still read both views BEFORE
 * committing, so a mistake here cannot leave the app unable to see its data.
 */
import 'dotenv/config';
import { Client } from 'pg';

const TABLES = [
  'licenses', 'branches', 'airlines', 'pnrs',
  'emd_rounds', 'ticketing', 'allocations', 'activity_log',
];

async function main() {
  const commit = process.argv.includes('--commit');
  const cs = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) throw new Error('DIRECT_URL or DATABASE_URL is not set.');

  const c = new Client({ connectionString: cs });
  await c.connect();
  await c.query('begin');

  try {
    for (const t of TABLES) {
      await c.query(`alter table ${t} enable row level security`);
    }
    console.log(`RLS enabled on ${TABLES.length} tables.`);

    await c.query('alter view refunded_emd_rounds set (security_invoker = on)');
    // `dashboard_totals` was dropped on 2026-09-24 (unused since 2026-09-09);
    // `refunded_emd_rounds` is the only view left.
    console.log('security_invoker = on set on refunded_emd_rounds.');

    for (const role of ['anon', 'authenticated']) {
      const { rows } = await c.query('select 1 from pg_roles where rolname = $1', [role]);
      if (rows.length === 0) { console.log(`  role ${role} absent — skipped`); continue; }
      await c.query(`revoke all on refunded_emd_rounds from ${role}`);
      console.log(`  revoked view access from ${role}`);
    }

    // Prove the app is unaffected before committing.
    // Access is proved by the query SUCCEEDING. It used to also demand at least
    // one refund row, which made this script refuse to commit on any database
    // with no refunds yet — including the live one after the 2026-09-20 reset.
    // A permission failure throws; an empty result is just an empty log.
    const refunds = await c.query('select count(*)::int n from refunded_emd_rounds');
    const pnrs = await c.query('select count(*)::int n from pnrs');
    console.log(`\nApp role still reads: ${refunds.rows[0].n} refund rows, ${pnrs.rows[0].n} PNRs.`);

    if (commit) {
      await c.query('commit');
      console.log('\nCOMMITTED.');
    } else {
      await c.query('rollback');
      console.log('\nDry run — rolled back. Re-run with --commit to apply.');
    }
  } catch (err) {
    await c.query('rollback');
    console.error('\nROLLED BACK:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
