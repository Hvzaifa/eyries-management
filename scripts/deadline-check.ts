/**
 * Manual runner for the daily deadline check (same code path as the cron route).
 *
 *   npx tsx scripts/deadline-check.ts             (dry-run: prints the email, sends nothing)
 *   npx tsx scripts/deadline-check.ts --send      (sends via Resend — needs RESEND_API_KEY)
 */
import 'dotenv/config';
import { todayIsoInPkt } from '../src/lib/urgency';
import { sendDeadlineAlert } from '../src/lib/deadlines';

async function main() {
  const send = process.argv.includes('--send');
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
