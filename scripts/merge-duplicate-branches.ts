/**
 * One-time merge of duplicate `branches` rows that differ only by letter case.
 *
 * Owner ruling (2026-09-07): branch names are case-insensitive identifiers —
 * "Rawalpindi" and "RAWALPINDI" are the same branch. The Step-1 seed created
 * title-case rows; the legacy sheet import then created upper-case rows for the
 * same offices, so one real branch ended up split across two records.
 *
 * For each group of rows sharing a name (ignoring case) this keeps ONE row — the
 * one already holding the most bookings, oldest row breaking a tie — repoints
 * every other row's PNRs onto it, and deletes the emptied rows. A PNR's branch
 * NAME is unchanged by this, so no booking changes meaning; only the row it
 * points at changes. Every repointed PNR gets an activity_log entry.
 *
 * Dry run (default):  npx tsx scripts/merge-duplicate-branches.ts
 * Apply:              npx tsx scripts/merge-duplicate-branches.ts --commit
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const commit = process.argv.includes('--commit');

  const branches = await prisma.branch.findMany({ orderBy: { createdAt: 'asc' } });
  const counts = await prisma.pnr.groupBy({ by: ['branchId'], _count: { _all: true } });
  const bookingsFor = (id: string) =>
    counts.find((c) => c.branchId === id)?._count._all ?? 0;

  // Group by case-insensitive name
  const groups = new Map<string, typeof branches>();
  for (const b of branches) {
    const key = b.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }

  const duplicates = [...groups.entries()].filter(([, rows]) => rows.length > 1);

  if (duplicates.length === 0) {
    console.log('No duplicate branch names found — nothing to merge.');
    return;
  }

  console.log(
    `${commit ? 'MERGING' : 'DRY RUN — no changes will be written'}\n` +
      `${duplicates.length} branch name(s) exist as more than one row.\n`
  );

  let totalRepointed = 0;
  let totalDeleted = 0;

  for (const [key, rows] of duplicates) {
    // Keep the row where this branch's bookings actually live; oldest wins ties.
    const ranked = [...rows].sort(
      (a, b) =>
        bookingsFor(b.id) - bookingsFor(a.id) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
    const keep = ranked[0];
    const drop = ranked.slice(1);
    const moving = drop.reduce((sum, d) => sum + bookingsFor(d.id), 0);

    console.log(`--- ${key.toUpperCase()} ---`);
    console.log(`  keep   "${keep.name}"  (${bookingsFor(keep.id)} bookings)  ${keep.id}`);
    for (const d of drop) {
      console.log(`  merge  "${d.name}"  (${bookingsFor(d.id)} bookings)  ${d.id}`);
    }
    console.log(`  -> ${moving} booking(s) repointed, ${drop.length} row(s) deleted`);

    totalRepointed += moving;
    totalDeleted += drop.length;

    if (!commit) continue;

    await prisma.$transaction(async (tx) => {
      for (const d of drop) {
        const affected = await tx.pnr.findMany({
          where: { branchId: d.id },
          select: { id: true },
        });

        if (affected.length > 0) {
          await tx.pnr.updateMany({
            where: { branchId: d.id },
            data: { branchId: keep.id },
          });

          // data-model.md: every write to `pnrs` is logged.
          await tx.activityLog.createMany({
            data: affected.map((p) => ({
              tableName: 'pnrs',
              recordId: p.id,
              fieldName: 'branch_id',
              oldValue: d.name,
              newValue: keep.name,
              changedBy: null,
            })),
          });
        }

        await tx.branch.delete({ where: { id: d.id } });
      }
    });
  }

  console.log(
    `\n${commit ? 'Done' : 'Would'}: ${totalRepointed} booking(s) repointed, ` +
      `${totalDeleted} duplicate row(s) removed.`
  );

  if (commit) {
    const left = await prisma.branch.findMany();
    const stillDuped = [...new Set(left.map((b) => b.name.toLowerCase()))].length !== left.length;
    console.log(
      `Branch rows now: ${left.length}. Duplicate names remaining: ${stillDuped ? 'YES' : 'none'}`
    );
    console.log(
      'Next: run `npm run db:apply` to add the unique index on lower(name) that ' +
        'prevents case-variant duplicates from being created again.'
    );
  } else {
    console.log('\nRe-run with --commit to apply.');
  }
}

main()
  .catch((err) => {
    console.error('Merge failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
