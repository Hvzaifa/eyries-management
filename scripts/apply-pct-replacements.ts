/**
 * One-time data hygiene pass (owner rule, 2026-08-24):
 * When a PNR's round percentages exceed 100%, a later round whose percentage
 * exactly matches an earlier round is a RE-ISSUE that replaces it:
 *   e.g. 30+70+30 -> round 3 replaces round 1 -> 30(new)+70 = 100.
 * The later round's data (amount, dates, number) wins; the earlier round is
 * deleted; round numbers are renumbered sequentially afterwards.
 * Every deletion/renumber is written to activity_log. PNRs with no matching
 * pair (or still ≠ 100 afterwards) are left untouched for review.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const pnrs = await prisma.pnr.findMany({
    include: { emdRounds: { orderBy: { roundNumber: 'asc' } } },
  });

  let touched = 0;
  for (const p of pnrs) {
    const rounds = p.emdRounds;
    if (rounds.length < 2) continue;
    const total = rounds.reduce((s, r) => s + Number(r.paymentPct), 0);
    if (total <= 100) continue;

    // Greedy pairing from the latest round backwards: later round replaces the
    // earliest unconsumed round with an identical percentage.
    const replacements: { laterId: string; earlierId: string; targetSlot: number; pct: number }[] = [];
    const consumed = new Set<string>();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const later = rounds[i];
      if (consumed.has(later.id)) continue;
      for (let j = 0; j < i; j++) {
        const earlier = rounds[j];
        if (consumed.has(earlier.id)) continue;
        if (Number(later.paymentPct) === Number(earlier.paymentPct)) {
          replacements.push({
            laterId: later.id,
            earlierId: earlier.id,
            targetSlot: earlier.roundNumber,
            pct: Number(later.paymentPct),
          });
          consumed.add(later.id);
          consumed.add(earlier.id);
          break;
        }
      }
    }
    if (replacements.length === 0) continue;

    for (const rep of replacements) {
      await prisma.activityLog.create({
        data: {
          tableName: 'emd_rounds',
          recordId: rep.earlierId,
          fieldName: null,
          oldValue: `round ${rep.targetSlot} (${rep.pct}%)`,
          newValue: 'deleted - replaced by later round with matching percentage',
        },
      });
      await prisma.emdRound.delete({ where: { id: rep.earlierId } });
      await prisma.emdRound.update({
        where: { id: rep.laterId },
        data: { roundNumber: rep.targetSlot },
      });
      await prisma.activityLog.create({
        data: {
          tableName: 'emd_rounds',
          recordId: rep.laterId,
          fieldName: 'round_number',
          oldValue: null,
          newValue: `moved into slot ${rep.targetSlot} (replaces earlier ${rep.pct}% round)`,
        },
      });
    }

    // Renumber remaining rounds sequentially (no gaps), descending to dodge
    // the unique (pnr_id, round_number) constraint.
    const remaining = await prisma.emdRound.findMany({
      where: { pnrId: p.id },
      orderBy: { roundNumber: 'asc' },
    });
    for (let n = remaining.length; n >= 1; n--) {
      const r = remaining[n - 1];
      if (r.roundNumber !== n) {
        await prisma.emdRound.update({ where: { id: r.id }, data: { roundNumber: n } });
        await prisma.activityLog.create({
          data: {
            tableName: 'emd_rounds',
            recordId: r.id,
            fieldName: 'round_number',
            oldValue: String(r.roundNumber),
            newValue: String(n),
          },
        });
      }
    }

    touched++;
    console.log(`${p.pnr}: ${rounds.map((r) => Number(r.paymentPct)).join('+')} -> ${remaining.map((r) => Number(r.paymentPct)).join('+')}`);
  }

  console.log(`\nDone. ${touched} PNRs adjusted.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
