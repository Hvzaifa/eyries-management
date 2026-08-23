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

  for (const branch of branchesData) {
    const existing = await prisma.branch.findFirst({ where: { name: branch.name } });
    if (!existing) {
      await prisma.branch.create({ data: branch });
    }
  }

  // Seed airlines
  const airlinesData = [
    { code: 'EK', name: 'Emirates', contactEmails: ['groups.ek@emirates.com'] },
    { code: 'QR', name: 'Qatar Airways', contactEmails: ['groups.qr@qatarairways.com'] },
    { code: 'PIA', name: 'Pakistan International Airlines', contactEmails: ['groups@piac.aero'] },
    { code: 'SV', name: 'Saudia', contactEmails: ['groups.sv@saudia.com'] },
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

export async function mainWithSamples() {
  await main();
  const { seedSamplePnrs } = await import('./seed-sample-pnrs');
  await seedSamplePnrs();
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  mainWithSamples()
    .catch((e) => {
      console.error('Error during seeding:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
