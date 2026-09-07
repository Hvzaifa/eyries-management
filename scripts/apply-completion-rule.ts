/**
 * Marks a booking `completed` once it is genuinely finished.
 *
 *   npx tsx scripts/apply-completion-rule.ts             (dry run — reports, writes nothing)
 *   npx tsx scripts/apply-completion-rule.ts --commit    (applies)
 *
 * Rule (docs/decisions.md, 2026-08-25 "Status definitions finalized", reaffirmed
 * by the owner on 2026-09-07): a PNR is completed when
 *
 *   1. its outbound date has passed, AND
 *   2. it has at least one EMD round, AND
 *   3. every one of those rounds is `refunded`.
 *
 * Condition 2 matters: without it a booking with no rounds at all would satisfy
 * "all rounds refunded" vacuously and be completed for no reason.
 *
 * Only `active` bookings are considered — `cancelled` is human-only per
 * business-rules.md, and re-completing a completed row would just add noise.
 * Every change writes an activity_log entry, as data-model.md requires.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { todayIsoInPkt } from '../src/lib/urgency';

async function main() {
  const commit = process.argv.includes('--commit');
  const todayIso = todayIsoInPkt();
  const today = new Date(`${todayIso}T00:00:00.000Z`);

  const candidates = await prisma.pnr.findMany({
    where: {
      status: 'active',
      outboundDate: { not: null, lt: today },
    },
    select: {
      id: true, pnr: true, srNo: true, outboundDate: true,
      emdRounds: { select: { status: true } },
    },
  });

  const toComplete = candidates.filter(
    (p) => p.emdRounds.length > 0 && p.emdRounds.every((r) => r.status === 'refunded')
  );

  console.log(`Today (PKT): ${todayIso}`);
  console.log(`Active PNRs whose outbound date has passed: ${candidates.length}`);
  console.log(`  ...of which every EMD round is refunded:  ${toComplete.length}`);
  console.log(`  ...left active (rounds not all refunded): ${candidates.length - toComplete.length}`);
  const noRounds = candidates.filter((p) => p.emdRounds.length === 0).length;
  if (noRounds > 0) {
    console.log(`  (${noRounds} of those have no EMD rounds at all and are deliberately skipped)`);
  }

  if (!commit) {
    for (const p of toComplete.slice(0, 15)) {
      console.log(`    SR#${p.srNo} ${p.pnr} — outbound ${p.outboundDate!.toISOString().slice(0, 10)}`);
    }
    if (toComplete.length > 15) console.log(`    ... and ${toComplete.length - 15} more`);
    console.log('\nDry run — nothing written. Re-run with --commit to apply.');
    return;
  }

  let done = 0;
  // Chunked so one long transaction cannot time out on a hosted database.
  const CHUNK = 200;
  for (let i = 0; i < toComplete.length; i += CHUNK) {
    const chunk = toComplete.slice(i, i + CHUNK);
    await prisma.$transaction(async (tx) => {
      for (const p of chunk) {
        await tx.pnr.update({ where: { id: p.id }, data: { status: 'completed' } });
        await tx.activityLog.create({
          data: {
            tableName: 'pnrs',
            recordId: p.id,
            fieldName: 'status',
            oldValue: 'active',
            newValue: 'completed',
          },
        });
        done++;
      }
    }, { timeout: 120_000 });
  }
  console.log(`\nMarked ${done} bookings completed (each activity-logged).`);
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
