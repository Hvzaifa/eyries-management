import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { findLookupRow } from '../src/lib/lookups';

/**
 * The lookup tables: licenses, branches and airlines.
 *
 *   npm run db:seed                dry run: prints what would change, writes nothing
 *   npm run db:seed -- --commit    backs up the lookup tables, then writes in one transaction
 *
 * Idempotent. It brings existing rows into line with the lists below and adds
 * what is missing. The only rows it deletes are the licenses the owner retired
 * (`RETIRED_LICENSES`), and only once nothing points at them.
 */

const prisma = new PrismaClient();

/**
 * Licenses: the supplier code from the owner's `suppliers.xlsx` and the full
 * name the owner gave it (2026-10-20). Shown by code, like branches. Where no
 * full name was given, the name is the code.
 */
const LICENSES: { code: string; name: string }[] = [
  { code: 'TA-ISB-BSP', name: 'Travel Advisor Islamabad' },
  { code: 'TA-LHE-BSP', name: 'Travel Advisor Lahore' },
  { code: 'TA-UET-BSP', name: 'Travel Advisor Quetta' },
  { code: 'TF-BSP', name: 'Time 2 Fly' },
  { code: 'HD-BSP', name: 'High Dreams Travel' },
  { code: 'TU-PIA (PSA)', name: 'TU-PIA (PSA)' },
  { code: 'SIX SIGMA', name: 'SIX SIGMA' },
];

/**
 * Licenses the owner removed (2026-10-20). Their bookings and EMD rounds move
 * to `moveTo` first, each move written to the booking's history. A retired
 * license still in use with no `moveTo` is refused rather than left dangling.
 */
const RETIRED_LICENSES: { name: string; moveTo: string | null }[] = [
  { name: 'TRV ADV', moveTo: 'TA-ISB-BSP' },
  { name: 'GLOBAL TRV', moveTo: null },
];

/**
 * Every branch, with the code it is shown by (owner, 2026-10-19). Names are the
 * owner's list exactly. A branch login is matched on the NAME, ignoring case, so
 * renaming "RAWALPINDI" to "Rawalpindi" leaves its login working.
 */
const BRANCHES = [
  { name: 'Islamabad', code: 'ISB' },
  { name: 'Karachi', code: 'KHI' },
  { name: 'Lahore', code: 'LHE' },
  { name: 'Multan', code: 'MUX' },
  { name: 'Rahim Yar Khan', code: 'RYK' },
  { name: 'Faisalabad', code: 'FSD' },
  { name: 'Peshawar', code: 'PEW' },
  { name: 'Kharian', code: 'QKH' },
  { name: 'Quetta', code: 'UET' },
  { name: 'Gujranwala', code: 'GRW' },
  { name: 'Sialkot', code: 'SKT' },
  { name: 'Rawalpindi', code: 'RWP' },
  { name: 'Corporate Lahore', code: 'STH-LHE' },
  { name: 'Six Sigma Group – Corp', code: 'STH' },
  { name: 'B2C Branch', code: 'B2C' },
  { name: 'Saudia Arabia', code: 'KSA' },
  { name: 'Customer Instant Registration', code: 'CIR' },
  { name: 'Dubai - AED', code: 'DXB' },
  { name: 'Central Sales Desk', code: 'CSD' },
  { name: 'Hyderabad', code: 'HDD' },
  { name: 'Mirpur Khas', code: 'MPD' },
];

/**
 * The airlines served, named exactly as in the owner's `suppliers.xlsx`
 * (Airlines tab), 2026-10-19: the nine already in use plus flynas, Riyadh Air,
 * SalamAir and flyadeal. `renamedFrom` moves an existing row to its IATA code
 * (PIA → PK), keeping its bookings. Contact emails are written only when a row
 * is created, so an address recorded since is never overwritten.
 */
const AIRLINES: { code: string; name: string; renamedFrom?: string; contactEmails?: string[] }[] = [
  { code: 'EK', name: 'Emirates-(EK)', contactEmails: ['groups.ek@emirates.com'] },
  { code: 'QR', name: 'Qatar Airways-(QR)', contactEmails: ['groups.qr@qatarairways.com'] },
  { code: 'PK', name: 'Pakistan International-(PK)', renamedFrom: 'PIA', contactEmails: ['groups@piac.aero'] },
  { code: 'SV', name: 'Saudi Arabian Airlines', contactEmails: ['groups.sv@saudia.com'] },
  { code: '9P', name: 'Fly Jinnah Services' },
  { code: 'FZ', name: 'Fly Dubai Airline-(FZ)' },
  { code: 'PF', name: 'AirSial' },
  { code: 'UL', name: 'Air Lanka-(UL)' },
  { code: 'PA', name: 'Airblue-(PA)' },
  { code: 'XY', name: 'FLY NAS - (XY)' },
  { code: 'RX', name: 'Riyadh Air' },
  { code: 'OV', name: 'Salam Air-(OV)' },
  { code: 'F3', name: 'Flydeal' },
];

async function main() {
  const commit = process.argv.includes('--commit');
  const [licenses, branches, airlines] = await Promise.all([
    prisma.license.findMany({ include: { _count: { select: { pnrs: true, emdRounds: true } } } }),
    prisma.branch.findMany(),
    prisma.airline.findMany(),
  ]);

  const writes: { say: string; run: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown> }[] = [];

  for (const l of LICENSES) {
    const row = findLookupRow(licenses, l);
    if (!row) {
      writes.push({ say: `license  + ${l.code}  ${l.name}`, run: (tx) => tx.license.create({ data: l }) });
    } else if (row.name !== l.name || row.code !== l.code) {
      writes.push({
        say: `license  ~ "${row.name}" (${row.code ?? 'no code'}) -> "${l.name}" (${l.code}), ${row._count.pnrs} bookings`,
        run: (tx) => tx.license.update({ where: { id: row.id }, data: l }),
      });
    }
  }

  for (const r of RETIRED_LICENSES) {
    const row = licenses.find((x) => x.name === r.name);
    if (!row) continue;
    const used = row._count.pnrs + row._count.emdRounds;
    if (used > 0 && !r.moveTo) {
      throw new Error(`License "${r.name}" is still used by ${row._count.pnrs} bookings and ${row._count.emdRounds} EMD rounds; give it a moveTo.`);
    }
    if (used > 0 && r.moveTo) {
      const target = r.moveTo;
      writes.push({
        say: `license  > ${row._count.pnrs} bookings, ${row._count.emdRounds} EMD rounds from "${r.name}" to "${target}"`,
        run: async (tx) => {
          // Looked up inside the transaction: the target may be a row renamed above.
          const to = await tx.license.findFirstOrThrow({ where: { OR: [{ code: target }, { name: target }] } });
          const moved = await tx.pnr.findMany({ where: { licenseId: row.id }, select: { id: true } });
          await tx.pnr.updateMany({ where: { licenseId: row.id }, data: { licenseId: to.id } });
          await tx.emdRound.updateMany({ where: { licenseId: row.id }, data: { licenseId: to.id } });
          await tx.activityLog.createMany({
            data: moved.map((p) => ({
              tableName: 'pnrs',
              recordId: p.id,
              fieldName: 'license',
              oldValue: r.name,
              newValue: `${target} (license ${r.name} removed by the owner, 2026-10-20)`,
              changedBy: null,
            })),
          });
        },
      });
    }
    writes.push({ say: `license  - ${r.name}`, run: (tx) => tx.license.delete({ where: { id: row.id } }) });
  }

  for (const b of BRANCHES) {
    const row = findLookupRow(branches, b);
    if (!row) {
      writes.push({ say: `branch   + ${b.code}  ${b.name}`, run: (tx) => tx.branch.create({ data: b }) });
    } else if (row.name !== b.name || row.code !== b.code) {
      writes.push({
        say: `branch   ~ "${row.name}" (${row.code ?? 'no code'}) -> "${b.name}" (${b.code})`,
        run: (tx) => tx.branch.update({ where: { id: row.id }, data: b }),
      });
    }
  }

  for (const a of AIRLINES) {
    const row =
      airlines.find((r) => r.code === a.code) ??
      (a.renamedFrom ? airlines.find((r) => r.code === a.renamedFrom) : undefined);
    if (!row) {
      writes.push({
        say: `airline  + ${a.code}  ${a.name}`,
        run: (tx) => tx.airline.create({ data: { code: a.code, name: a.name, contactEmails: a.contactEmails ?? [] } }),
      });
    } else if (row.code !== a.code || row.name !== a.name) {
      writes.push({
        say: `airline  ~ ${row.code} "${row.name}" -> ${a.code} "${a.name}"`,
        run: (tx) => tx.airline.update({ where: { id: row.id }, data: { code: a.code, name: a.name } }),
      });
    }
  }

  for (const w of writes) console.log(w.say);
  if (writes.length === 0) {
    console.log('Lookup tables already match. Nothing to do.');
    return;
  }
  if (!commit) {
    console.log(`\nDry run: ${writes.length} change(s), nothing written. Re-run with -- --commit to apply.`);
    return;
  }

  // Bookings point at these rows, so a wrong rename shows on every booking.
  // Keep what was there, to put it back from.
  const dir = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}-lookups`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/licenses.json`, JSON.stringify(licenses, null, 2));
  // Which booking held which license, so a moved booking can be put back.
  const licenseOfBookings = await prisma.pnr.findMany({ select: { id: true, pnr: true, licenseId: true } });
  writeFileSync(`${dir}/pnr-licenses.json`, JSON.stringify(licenseOfBookings, null, 2));
  writeFileSync(`${dir}/branches.json`, JSON.stringify(branches, null, 2));
  writeFileSync(`${dir}/airlines.json`, JSON.stringify(airlines, null, 2));
  console.log(`\nBacked up to ${dir}/`);

  await prisma.$transaction(async (tx) => {
    for (const w of writes) await w.run(tx);
  }, { timeout: 30_000 });
  console.log(`Committed ${writes.length} change(s).`);
}

// Seeds ONLY the lookup tables. It once also inserted fabricated `TEST-*`
// bookings, which made the documented `npm run db:seed` write fake bookings
// into live data; removed 2026-09-07.
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  main()
    .catch((e) => {
      console.error('Error during seeding:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
