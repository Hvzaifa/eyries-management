import 'dotenv/config';
import { parseAirlineMessage } from '../src/lib/ai/parse-booking';

const SAMPLE_AIRLINE_CONFIRMATIONS = [
  {
    name: 'Saudia (SV) Umrah Group Confirmation',
    text: `SAUDIA AIRLINES - GROUP BOOKING CONFIRMATION
BOOKING REF / PNR: SV982K
GDS REF: 1S/88HJK9
AGENT / INVESTOR: AL-MAQAM TRAVELS & TOURS (RAWALPINDI BRANCH)
SECTOR: ISB-JED-MED-ISB
SEGMENT: UMRAH
TOTAL SEATS: 45
OUTBOUND DATE: 2026-11-15
INBOUND DATE: 2026-11-30
FARE PER SEAT (BASE): PKR 175,000
TAXES: PKR 28,500
PSF: PKR 2,000
TIME LIMIT / PNR TL: 2026-09-10

EMD DEPOSIT SCHEDULE:
1ST EMD (15%): PKR 1,181,250 DUE BY 2026-09-10 18:00 PKT
ISSUED REF: EMD-065-9982310`,
  },
  {
    name: 'Fly Jinnah (9P) Group PNR Message',
    text: `Dear Partner,
Your group booking has been confirmed under PNR: 9P4421.
Passenger count: 32 Seats
Route: KHI - ISB - KHI
Travel Dates: Outbound 24OCT26, Return 02NOV26
Net Group Fare: 38,500 PKR per passenger
Client: Skyline Express Holidays
Time Limit for initial deposit: 2026-09-15 15:00
Please ensure payment before deadline to avoid automatic cancellation.`,
  },
];

async function main() {
  console.log('====================================================');
  console.log('       OPENROUTER AI PARSING SMOKE TEST             ');
  console.log('====================================================\n');

  for (const sample of SAMPLE_AIRLINE_CONFIRMATIONS) {
    console.log(`\nTesting sample: "${sample.name}"...`);
    try {
      const draft = await parseAirlineMessage(sample.text);
      console.log('Extracted Booking Draft:');
      console.log(`  PNR:             ${draft.pnr.value} (${draft.pnr.confidence})`);
      console.log(`  GDS PNR:         ${draft.gdsPnr.value} (${draft.gdsPnr.confidence})`);
      console.log(`  Airline:         ${draft.airlineCode.value} (${draft.airlineCode.confidence})`);
      console.log(`  Company:         ${draft.investorCompany.value} (${draft.investorCompany.confidence})`);
      console.log(`  Seats:           ${draft.seats.value} (${draft.seats.confidence})`);
      console.log(`  Sector:          ${draft.sector.value} (${draft.sector.confidence})`);
      console.log(`  Outbound Date:   ${draft.outboundDate.value} (${draft.outboundDate.confidence})`);
      console.log(`  Inbound Date:    ${draft.inboundDate.value} (${draft.inboundDate.confidence})`);
      console.log(`  Fare:            ${draft.fare.value} (${draft.fare.confidence})`);
      console.log(`  PNR TL Date:     ${draft.pnrTlDate.value} (${draft.pnrTlDate.confidence})`);
      console.log(`  EMD 1 Amount:    ${draft.roundEmdAmount.value} (${draft.roundEmdAmount.confidence})`);
      console.log(`  EMD 1 Deadline:  ${draft.roundDeadlineDate.value} (${draft.roundDeadlineDate.confidence})`);
      console.log(`  Model Used:      ${draft.modelUsed}`);
      console.log('✅ Extraction successful!');
    } catch (err) {
      console.error(`❌ Parsing failed for "${sample.name}":`, err);
    }
  }

  console.log('\n====================================================');
  console.log('Smoke test complete.');
}

main().catch((e) => {
  console.error('Smoke test runner failed:', e);
  process.exit(1);
});
