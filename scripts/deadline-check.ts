/**
 * Manual runner for the daily deadline job (same code path as the cron route).
 *
 *   npx tsx scripts/deadline-check.ts                (dry-run: prints the email, sends nothing)
 *   npx tsx scripts/deadline-check.ts --send         (sends via Resend — needs RESEND_API_KEY)
 *   npx tsx scripts/deadline-check.ts --backfill-only (sets missing EMD-2 deadlines, no email)
 */
import 'dotenv/config';
import { todayIsoInPkt } from '../src/lib/urgency';
import { backfillEmd2Deadlines, sendDeadlineAlert } from '../src/lib/deadlines';

async function main() {
  const send = process.argv.includes('--send');
  const backfillOnly = process.argv.includes('--backfill-only');

  const backfill = await backfillEmd2Deadlines();
  console.log(
    `EMD-2 deadlines set: ${backfill.set} | no EMD-2 round: ${backfill.skippedNoEmd2} | ` +
      `non-SV skipped: ${backfill.skippedNotSv} | missing dates: ${backfill.skippedNoDates}`
  );
  for (const d of backfill.details) console.log(`  ${d.pnrCode} -> EMD-2 deadline ${d.deadline}`);

  if (backfillOnly) {
    process.exit(0);
  }

  const result = await sendDeadlineAlert(todayIsoInPkt(), { dryRun: !send });

  console.log(`Today (PKT): ${todayIsoInPkt()}`);
  console.log(`Recipients: ${result.recipients.join(', ') || '(none configured)'}`);
  console.log(`Due rounds: ${result.alerts.length}`);

  if (result.alerts.length > 0) {
    for (const a of result.alerts) {
      console.log(
        `  ${a.pnrCode} r${a.roundNumber} ${a.airlineCode ?? '—'} ${a.seats} seats ` +
          `PKR ${a.emdAmount.toLocaleString('en-US')} due ${a.deadlineDate} ` +
          `(${a.overdue ? `OVERDUE ${Math.abs(a.daysLeft)}d` : `in ${a.daysLeft}d`})`
      );
    }
    console.log(`\nSubject: ${result.subject}`);
  }

  if (result.error) {
    console.error(`\nNot sent: ${result.error}`);
    process.exit(1);
  }
  if (!send) {
    console.log('\nDry run only. Re-run with --send to deliver the email.');
  } else if (result.sent) {
    console.log('\nEmail sent.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
