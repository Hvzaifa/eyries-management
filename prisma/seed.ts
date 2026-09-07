import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial lookup tables (licenses, branches, airlines)...');

  // Seed licenses
  const licensesData = [
    { name: 'TRV ADV' },
    { name: 'SIX SIGMA' },
    { name: 'GLOBAL TRV' },
  ];

  for (const lic of licensesData) {
    const existing = await prisma.license.findFirst({ where: { name: lic.name } });
    if (!existing) {
      await prisma.license.create({ data: lic });
    }
  }

  // Seed branches
  const branchesData = [
    { name: 'Rawalpindi' },
    { name: 'Islamabad' },
    { name: 'Peshawar' },
    { name: 'Faisalabad' },
  ];

  // Case-insensitive match: branch names identify a branch regardless of case
  // (owner ruling, 2026-09-07). An exact-match lookup here is what originally
  // created "Rawalpindi" alongside the imported "RAWALPINDI" as two rows.
  for (const branch of branchesData) {
    const existing = await prisma.branch.findFirst({
      where: { name: { equals: branch.name, mode: 'insensitive' } },
    });
    if (!existing) {
      await prisma.branch.create({ data: branch });
    }
  }

  // Seed airlines (names confirmed by project owner 2026-08-24)
  const airlinesData = [
    { code: 'EK', name: 'Emirates', contactEmails: ['groups.ek@emirates.com'] },
    { code: 'QR', name: 'Qatar Airways', contactEmails: ['groups.qr@qatarairways.com'] },
    { code: 'PIA', name: 'Pakistan International Airlines', contactEmails: ['groups@piac.aero'] },
    { code: 'SV', name: 'Saudia', contactEmails: ['groups.sv@saudia.com'] },
    { code: '9P', name: 'Fly Jinnah', contactEmails: [] },
    { code: 'FZ', name: 'flydubai', contactEmails: [] },
    { code: 'PF', name: 'AirSial', contactEmails: [] },
    { code: 'UL', name: 'Srilankan Airlines', contactEmails: [] },
  ];

  for (const airline of airlinesData) {
    const existing = await prisma.airline.findFirst({ where: { code: airline.code } });
    if (!existing) {
      await prisma.airline.create({ data: airline });
    } else {
      await prisma.airline.update({
        where: { id: existing.id },
        data: { name: airline.name, contactEmails: airline.contactEmails },
      });
    }
  }

  console.log('Seeding completed successfully!');
}

// This seeds ONLY the lookup tables, which is what the README says it does.
// It used to also insert fabricated `TEST-*` bookings via a `seedSamplePnrs()`
// helper — scaffolding from Phase 1 Step 3, used to eyeball the urgency colours
// before real data existed. With 1,015 real bookings imported and the urgency
// rules covered by unit tests, that scaffolding was obsolete; worse, it meant
// running the documented `npm run db:seed` against production would write fake
// bookings into live data. Removed 2026-09-07.
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
