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
    await c.query('alter view dashboard_totals   set (security_invoker = on)');
    console.log('security_invoker = on set on both views.');

    for (const role of ['anon', 'authenticated']) {
      const { rows } = await c.query('select 1 from pg_roles where rolname = $1', [role]);
      if (rows.length === 0) { console.log(`  role ${role} absent — skipped`); continue; }
      await c.query(`revoke all on refunded_emd_rounds from ${role}`);
      await c.query(`revoke all on dashboard_totals   from ${role}`);
      console.log(`  revoked view access from ${role}`);
    }

    // Prove the app is unaffected before committing.
    const refunds = await c.query('select count(*)::int n from refunded_emd_rounds');
    const totals = await c.query('select active_pnrs from dashboard_totals');
    console.log(`\nApp role still reads: ${refunds.rows[0].n} refund rows, ${totals.rows[0].active_pnrs} active PNRs.`);
    if (refunds.rows[0].n === 0 || totals.rows.length === 0) {
      throw new Error('App role lost access to a view — refusing to commit.');
    }

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
