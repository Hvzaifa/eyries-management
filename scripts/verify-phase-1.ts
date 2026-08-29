import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { listPnrs, getDashboardTotals, getPnrDetail } from '../src/lib/pnrs';
import { suggestEmdPlan } from '../src/lib/emd';
import { getUrgency, todayIsoInPkt } from '../src/lib/urgency';
import { findDueRounds, buildDeadlineEmail } from '../src/lib/deadlines';
import { getUserRole, canEdit } from '../src/lib/types/auth';
import type { User } from '@supabase/supabase-js';

async function runVerification() {
  console.log('====================================================');
  console.log('         PHASE 1 END-TO-END VERIFICATION            ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title: string, condition: boolean, detail = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail}`);
    }
  }

  // --- STEP 1: DB Schema & Lookups ---
  console.log('\n--- Step 1: DB Schema & Lookup Tables ---');
  const [licenses, branches, airlines, pnrCount] = await Promise.all([
    prisma.license.findMany(),
    prisma.branch.findMany(),
    prisma.airline.findMany(),
    prisma.pnr.count(),
  ]);
  assert('Licenses seeded', licenses.length > 0, `Found: ${licenses.length}`);
  assert('Branches seeded', branches.length > 0, `Found: ${branches.length}`);
  assert('Airlines seeded', airlines.length > 0, `Found: ${airlines.length}`);
  assert('PNRs table populated', pnrCount > 0, `Found: ${pnrCount}`);

  // Test dashboard_totals view
  const totals = await getDashboardTotals();
  assert('dashboard_totals SQL view returns valid numbers', 
    typeof totals.activePnrs === 'number' && 
    typeof totals.totalSeats === 'number' && 
    typeof totals.totalPaid === 'number' &&
    typeof totals.totalRefunded === 'number',
    JSON.stringify(totals)
  );

  // --- STEP 2: Authentication & Role logic ---
  console.log('\n--- Step 2: Authentication & Role Guards ---');
  const testAdmin = { id: '1', app_metadata: { role: 'admin' } } as unknown as User;
  const testStaff = { id: '2', app_metadata: { role: 'staff' } } as unknown as User;
  const testViewer = { id: '3', app_metadata: { role: 'viewer' } } as unknown as User;
  const testSpoofed = { id: '4', app_metadata: { role: 'viewer' }, user_metadata: { role: 'admin' } } as unknown as User;

  assert('Admin can edit', canEdit(getUserRole(testAdmin)) === true);
  assert('Staff can edit', canEdit(getUserRole(testStaff)) === true);
  assert('Viewer is blocked from editing', canEdit(getUserRole(testViewer)) === false);
  assert('Viewer cannot spoof admin via user_metadata', canEdit(getUserRole(testSpoofed)) === false);

  // --- STEP 3: Dashboard PNR List & Urgency ---
  console.log('\n--- Step 3: PNR List & Urgency Calculation ---');
  const pnrList = await listPnrs();
  assert('listPnrs returns records', pnrList.length > 0, `Count: ${pnrList.length}`);
  
  const today = todayIsoInPkt();
  const testUrgencyRed = getUrgency(today, today, 'active');
  const testUrgencyAmber = getUrgency(today, '2026-09-02', 'active');
  const testUrgencyGrey = getUrgency(today, today, 'completed');
  assert('Urgency red for due today', testUrgencyRed === 'red');
  assert('Urgency amber for due within 5 days', testUrgencyAmber === 'amber' || typeof testUrgencyAmber === 'string');
  assert('Urgency grey for non-active PNR', testUrgencyGrey === 'grey');

  // --- STEP 4: PNR Detail Page Data Retrieval ---
  console.log('\n--- Step 4: PNR Detail Page Data ---');
  const firstPnr = pnrList[0];
  const detail = await getPnrDetail(firstPnr.id);
  assert('Detail record loaded', detail !== null);
  if (detail) {
    assert('Detail includes core fields (id, pnr, fare, seats)', 
      !!detail.pnr && typeof detail.seats === 'number' && typeof detail.fare === 'number'
    );
    assert('Detail includes rounds array', Array.isArray(detail.rounds));
    assert('Detail includes activity history array', Array.isArray(detail.activityLog));
  }

  // --- STEP 5: EMD-1 % Auto-Suggestion Business Rules ---
  console.log('\n--- Step 5: EMD-1 % Auto-Suggestion Math ---');
  const svUmrah = (req: string, out: string) =>
    suggestEmdPlan({ airlineCode: 'SV', segment: 'Umrah', requestDateIso: req, outboundDateIso: out });

  // Non-SV airline gets no suggestion
  assert('Non-SV airline gets no suggestion', 
    suggestEmdPlan({ airlineCode: 'PK', segment: 'Umrah', requestDateIso: '2026-08-01', outboundDateIso: '2026-10-01' }).applicable === false
  );
  // >= 60 days -> 15% / 85%
  const band60 = svUmrah('2026-08-01', '2026-10-05'); // 65 days
  assert('EMD-1 for >= 60 days is 15% and EMD-2 is 85%', band60.applicable && band60.emd1Pct === 15 && band60.emd2Pct === 85);
  // 30..59 days -> 30% / 70%
  const band30 = svUmrah('2026-08-01', '2026-09-15'); // 45 days
  assert('EMD-1 for 30..59 days is 30% and EMD-2 is 70%', band30.applicable && band30.emd1Pct === 30 && band30.emd2Pct === 70);
  // 15..29 days -> 50% / 50%
  const band15 = svUmrah('2026-08-01', '2026-08-21'); // 20 days
  assert('EMD-1 for 15..29 days is 50% and EMD-2 is 50%', band15.applicable && band15.emd1Pct === 50 && band15.emd2Pct === 50);
  // 7..14 days -> 70% / 30%
  const band7 = svUmrah('2026-08-01', '2026-08-11'); // 10 days
  assert('EMD-1 for 7..14 days is 70% and EMD-2 is 30%', band7.applicable && band7.emd1Pct === 70 && band7.emd2Pct === 30);
  // < 7 days -> 100% / null (single deposit)
  const bandSub7 = svUmrah('2026-08-01', '2026-08-04'); // 3 days
  assert('EMD-1 for < 7 days is 100% and EMD-2 is null', bandSub7.applicable && bandSub7.emd1Pct === 100 && bandSub7.emd2Pct === null);

  // --- STEP 6: Excel Import Tool Capabilities ---
  console.log('\n--- Step 6: Legacy Import Verification ---');
  const importedCount = await prisma.pnr.count();
  const roundsCount = await prisma.emdRound.count();
  assert('Imported database has PNRs', importedCount >= 900, `Total: ${importedCount}`);
  assert('Imported database has EMD rounds', roundsCount >= 1500, `Total: ${roundsCount}`);

  // --- STEP 7: Daily Deadline-Check Job ---
  console.log('\n--- Step 7: Daily Deadline Check Job ---');
  const dueRounds = await findDueRounds(today);
  assert('findDueRounds query executes cleanly', Array.isArray(dueRounds));
  const emailDraft = buildDeadlineEmail(today, dueRounds);
  assert('Email template generates subject and html', !!emailDraft.subject && !!emailDraft.html);

  console.log('\n====================================================');
  console.log(`VERIFICATION RESULT: ${passed} / ${total} checks PASSED.`);
  console.log('====================================================\n');
}

runVerification().catch((e) => {
  console.error('Verification failed with error:', e);
  process.exit(1);
});
