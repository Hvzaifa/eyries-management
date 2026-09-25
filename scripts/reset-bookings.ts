/**
 * Clears the BOOKINGS so data can be re-entered and tested from scratch.
 *
 *   npx tsx scripts/reset-bookings.ts            dry run — counts only
 *   npx tsx scripts/reset-bookings.ts --commit   backs up, then deletes
 *
 * Narrower than `reset-transactional-data.ts`, which also wipes the agents.
 * This one keeps them, along with the lookup tables and every login.
 *
 * **What goes, and why it is more than pnrs + emd_rounds.** Ticketing rows,
 * allocations, agent assignments and the recoveries recorded against them all
 * hang off a booking by foreign key — `on delete cascade` — so they cannot
 * outlive it. A recovery belongs to an assignment, which belongs to a booking;
 * keeping it would leave money recorded against seats that no longer exist.
 *
 * **What stays:** agents (they are records in their own right, not booking
 * data), licenses, branches, airlines, Supabase auth accounts, and the
 * activity-log entries about the agents themselves. Log entries about the
 * deleted bookings go with them.
 *
 * `--commit` writes `backups/<timestamp>/*.json` BEFORE deleting anything. The
 * deletion cannot be undone any other way.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const commit = process.argv.includes('--commit');

  const agentIds = (await prisma.agent.findMany({ select: { id: true } })).map((a) => a.id);
  /** Log entries about the agents survive; everything else was about a booking. */
  const bookingLogWhere = { recordId: { notIn: agentIds } };

  const going = {
    pnrs: await prisma.pnr.count(),
    emd_rounds: await prisma.emdRound.count(),
    ticketing: await prisma.ticketing.count(),
    allocations: await prisma.allocation.count(),
    agent_assignments: await prisma.agentAssignment.count(),
    agent_recoveries: await prisma.agentRecovery.count(),
    activity_log: await prisma.activityLog.count({ where: bookingLogWhere }),
  };
  const staying = {
    agents: await prisma.agent.count(),
    licenses: await prisma.license.count(),
    branches: await prisma.branch.count(),
    airlines: await prisma.airline.count(),
    'activity_log (agents)': await prisma.activityLog.count({ where: { recordId: { in: agentIds } } }),
  };

  console.log('\nTo delete:');
  for (const [t, n] of Object.entries(going)) console.log(`  ${t.padEnd(24)} ${n}`);
  console.log('To keep:');
  for (const [t, n] of Object.entries(staying)) console.log(`  ${t.padEnd(24)} ${n}`);

  if (!commit) {
    console.log('\nDry run — nothing deleted. Re-run with --commit.\n');
    await prisma.$disconnect();
    return;
  }

  // Back up first. Every table, not just the ones being deleted: a restore
  // needs the lookups to resolve against.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = `backups/${stamp}`;
  mkdirSync(dir, { recursive: true });
  const dump: [string, unknown[]][] = [
    ['pnrs', await prisma.pnr.findMany()],
    ['emd_rounds', await prisma.emdRound.findMany()],
    ['ticketing', await prisma.ticketing.findMany()],
    ['allocations', await prisma.allocation.findMany()],
    ['agents', await prisma.agent.findMany()],
    ['agent_assignments', await prisma.agentAssignment.findMany()],
    ['agent_recoveries', await prisma.agentRecovery.findMany()],
    ['activity_log', await prisma.activityLog.findMany()],
    ['licenses', await prisma.license.findMany()],
    ['branches', await prisma.branch.findMany()],
    ['airlines', await prisma.airline.findMany()],
  ];
  for (const [name, rows] of dump) {
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(rows, null, 2));
  }
  console.log(`\nBacked up ${dump.length} tables to ${dir}/`);

  // Children before parents. Most of these would cascade from `pnrs`, but
  // deleting explicitly means the script reports exactly what it removed
  // instead of trusting the database to have the cascades right.
  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany({ where: bookingLogWhere });
    await tx.agentRecovery.deleteMany({});
    await tx.agentAssignment.deleteMany({});
    await tx.allocation.deleteMany({});
    await tx.ticketing.deleteMany({});
    await tx.emdRound.deleteMany({});
    await tx.pnr.deleteMany({});
  });

  // The SR# is what staff read on the dashboard. Fresh bookings counting from 5
  // would look like the old data was still in there somewhere.
  await prisma.$executeRawUnsafe('alter sequence pnrs_sr_no_seq restart with 1');

  const after = {
    pnrs: await prisma.pnr.count(),
    emd_rounds: await prisma.emdRound.count(),
    ticketing: await prisma.ticketing.count(),
    agent_assignments: await prisma.agentAssignment.count(),
    agent_recoveries: await prisma.agentRecovery.count(),
    agents: await prisma.agent.count(),
    licenses: await prisma.license.count(),
    branches: await prisma.branch.count(),
    airlines: await prisma.airline.count(),
  };
  console.log('\nAfter:');
  for (const [t, n] of Object.entries(after)) console.log(`  ${t.padEnd(24)} ${n}`);
  console.log('\nNext booking will be SR#1.\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
