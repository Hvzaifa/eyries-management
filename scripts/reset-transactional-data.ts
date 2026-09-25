/**
 * Clears every transactional row so data can be re-entered cleanly.
 *
 *   npx tsx scripts/reset-transactional-data.ts            dry run — counts only
 *   npx tsx scripts/reset-transactional-data.ts --commit   deletes, in one transaction
 *
 * **Back up first** (`backups/<timestamp>/*.json`) — this cannot be undone.
 *
 * Deletes: pnrs, emd_rounds, ticketing, allocations, agents, agent_assignments,
 * activity_log.
 *
 * KEEPS the lookup tables — licenses, branches, airlines — and never touches
 * Supabase auth accounts. Branch logins resolve their branch **by name** against
 * `branches`, so dropping those rows locks every branch account out of every
 * booking (docs/operations.md). Airlines carry the contact addresses airline mail
 * is restricted to, and SV's code drives the EMD policy.
 *
 * Also resets `pnrs_sr_no_seq` to 1: the SR# is what staff read, and fresh data
 * counting from 1504 would look like the old data was still there.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const commit = process.argv.includes('--commit');

  const counts = {
    activity_log: await prisma.activityLog.count(),
    agent_assignments: await prisma.agentAssignment.count(),
    agents: await prisma.agent.count(),
    allocations: await prisma.allocation.count(),
    ticketing: await prisma.ticketing.count(),
    emd_rounds: await prisma.emdRound.count(),
    pnrs: await prisma.pnr.count(),
  };
  const keep = {
    licenses: await prisma.license.count(),
    branches: await prisma.branch.count(),
    airlines: await prisma.airline.count(),
  };

  console.log('To delete:');
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(20)} ${n}`);
  console.log('To keep:');
  for (const [t, n] of Object.entries(keep)) console.log(`  ${t.padEnd(20)} ${n}`);

  if (!commit) {
    console.log('\nDry run — nothing deleted. Re-run with --commit.');
    await prisma.$disconnect();
    return;
  }

  // Delete order follows the foreign keys: children before parents. Several of
  // these cascade from `pnrs`, but deleting explicitly means the script says
  // exactly what it removed rather than relying on cascade behaviour.
  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany({});
    await tx.agentAssignment.deleteMany({});
    await tx.agent.deleteMany({});
    await tx.allocation.deleteMany({});
    await tx.ticketing.deleteMany({});
    await tx.emdRound.deleteMany({});
    await tx.pnr.deleteMany({});
    // SR# restarts, so the first booking entered reads SR#1.
    await tx.$executeRawUnsafe('alter sequence pnrs_sr_no_seq restart with 1');
  }, { timeout: 120_000 });

  const after = {
    pnrs: await prisma.pnr.count(),
    emd_rounds: await prisma.emdRound.count(),
    ticketing: await prisma.ticketing.count(),
    allocations: await prisma.allocation.count(),
    agents: await prisma.agent.count(),
    agent_assignments: await prisma.agentAssignment.count(),
    activity_log: await prisma.activityLog.count(),
    licenses: await prisma.license.count(),
    branches: await prisma.branch.count(),
    airlines: await prisma.airline.count(),
  };
  console.log('\nAfter:', after);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
