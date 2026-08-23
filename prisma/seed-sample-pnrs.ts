import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function dayOffset(offset: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return new Date(d.toISOString().slice(0, 10));
}

export async function seedSamplePnrs() {
  console.log('Seeding sample PNRs and EMD rounds...');
  await prisma.pnr.deleteMany({ where: { pnr: { startsWith: 'TEST-' } } });

  const [trvAdv, sixSigma] = await prisma.license.findMany({ orderBy: { name: 'asc' } });
  const [isb, rwp, pesh, fsd] = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  const [ek, qr, pia, sv] = await prisma.airline.findMany({ orderBy: { code: 'asc' } });

  if (!trvAdv || !sixSigma || !isb || !rwp || !pesh || !fsd || !ek || !qr || !pia || !sv) {
    throw new Error('Lookup tables must be seeded before sample PNRs.');
  }

  // RED — pending round due tomorrow.
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-45),
      investorCompany: 'Al-Noor Travels',
      licenseId: trvAdv.id,
      branchId: isb.id,
      pnr: 'TEST-RED-01',
      segment: 'Employment',
      airlineId: ek.id,
      seats: 50,
      outboundDate: dayOffset(60),
      sector: 'ISB-DXB-ISB',
      dealPct: 7.5,
      fare: 85000,
      airlineTaxes: 42000,
      psf: 1500,
      emdRounds: {
        create: {
          roundNumber: 1,
          issuanceDate: dayOffset(-44),
          paymentPct: 15,
          emdNumber: 'EK-EMD-1001',
          emdAmount: 400000,
          deadlineDate: dayOffset(1),
        },
      },
    },
  });

  // RED — round 1 refunded earlier, round 2 pending in exactly 2 days.
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-80),
      investorCompany: 'Sahara Enterprises',
      licenseId: sixSigma.id,
      branchId: rwp.id,
      pnr: 'TEST-RED-MULTI-02',
      segment: 'Umrah',
      airlineId: sv.id,
      seats: 90,
      outboundDate: dayOffset(45),
      sector: 'ISB-JED-ISB',
      dealPct: 10,
      fare: 92000,
      airlineTaxes: 48000,
      psf: 1500,
      emdRounds: {
        create: [
          {
            roundNumber: 1,
            issuanceDate: dayOffset(-79),
            paymentPct: 15,
            emdNumber: 'SV-EMD-2001',
            emdAmount: 600000,
            deadlineDate: dayOffset(-50),
            status: 'refunded',
            refundAmount: 600000,
            refundDate: dayOffset(-49),
          },
          {
            roundNumber: 2,
            issuanceDate: dayOffset(-48),
            paymentPct: 30,
            emdNumber: 'SV-EMD-2002',
            emdAmount: 1200000,
            deadlineDate: dayOffset(2),
          },
        ],
      },
    },
  });

  // AMBER — pending deadline in 4 days; agent-booked via GDS.
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-20),
      investorCompany: 'Khyber Tourism',
      licenseId: trvAdv.id,
      branchId: pesh.id,
      pnr: 'TEST-AMBER-03',
      gdsPnr: 'GDS-7Q4KXZ',
      segment: 'Tour',
      airlineId: qr.id,
      seats: 25,
      outboundDate: dayOffset(90),
      inboundDate: dayOffset(97),
      sector: 'ISB-DOH-ISB',
      fare: 78000,
      emdRounds: {
        create: {
          roundNumber: 1,
          issuanceDate: dayOffset(-19),
          paymentPct: 30,
          emdAmount: 550000,
          deadlineDate: dayOffset(4),
        },
      },
    },
  });

  // GREEN — pending deadline far out; minimal optional fields.
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-3),
      investorCompany: 'Faisalabad Hajj & Umrah',
      licenseId: sixSigma.id,
      branchId: fsd.id,
      pnr: 'TEST-GREEN-04',
      segment: 'Umrah',
      airlineId: pia.id,
      seats: 40,
      outboundDate: dayOffset(120),
      sector: 'ISB-JED-ISB',
      fare: 68000,
      emdRounds: {
        create: {
          roundNumber: 1,
          issuanceDate: dayOffset(-2),
          paymentPct: 15,
          emdAmount: 300000,
          deadlineDate: dayOffset(30),
        },
      },
    },
  });

  // GREEN — active with no pending rounds (all resolved).
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-100),
      investorCompany: 'Indus Manpower',
      licenseId: trvAdv.id,
      branchId: isb.id,
      pnr: 'TEST-GREEN-NOROUNDS-05',
      segment: 'Employment',
      airlineId: ek.id,
      seats: 30,
      outboundDate: dayOffset(15),
      sector: 'ISB-DXB-ISB',
      issuedStatus: 'issued',
      dealPct: 5,
      fare: 81000,
      airlineTaxes: 39000,
      psf: 1500,
      emdRounds: {
        create: {
          roundNumber: 1,
          issuanceDate: dayOffset(-99),
          paymentPct: 50,
          emdAmount: 900000,
          deadlineDate: dayOffset(-70),
          status: 'paid',
        },
      },
    },
  });

  // GREY — cancelled, yet has an OVERDUE pending deadline (must stay grey).
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-60),
      investorCompany: 'Bolan Overseas',
      licenseId: sixSigma.id,
      branchId: rwp.id,
      pnr: 'TEST-GREY-CANCELLED-06',
      segment: 'Employment',
      airlineId: pia.id,
      seats: 20,
      outboundDate: dayOffset(30),
      sector: 'ISB-RUH-ISB',
      fare: 74000,
      status: 'cancelled',
      emdRounds: {
        create: {
          roundNumber: 1,
          issuanceDate: dayOffset(-59),
          paymentPct: 30,
          emdAmount: 350000,
          deadlineDate: dayOffset(-1),
        },
      },
    },
  });

  // GREY — completed, no rounds.
  await prisma.pnr.create({
    data: {
      requestDate: dayOffset(-150),
      investorCompany: 'Margalla Group',
      licenseId: trvAdv.id,
      branchId: pesh.id,
      pnr: 'TEST-GREY-COMPLETED-07',
      segment: 'Tour',
      airlineId: sv.id,
      seats: 15,
      outboundDate: dayOffset(-30),
      inboundDate: dayOffset(-23),
      sector: 'ISB-JED-ISB',
      issuedStatus: 'issued',
      fare: 88000,
      status: 'completed',
    },
  });

  console.log('Sample PNRs created (red x2, amber, green x2, grey x2).');

  const greenNoRounds = await prisma.pnr.findFirst({ where: { pnr: 'TEST-GREEN-NOROUNDS-05' } });
  if (greenNoRounds) {
    await prisma.ticketing.upsert({
      where: { pnrId: greenNoRounds.id },
      update: {
        nameUpdateDeadline: dayOffset(7),
        ticketIssuanceDeadline: dayOffset(14),
        status: 'in progress',
        ticketsIssued: 12,
        balanceTickets: 18,
      },
      create: {
        pnrId: greenNoRounds.id,
        nameUpdateDeadline: dayOffset(7),
        ticketIssuanceDeadline: dayOffset(14),
        status: 'in progress',
        ticketsIssued: 12,
        balanceTickets: 18,
      },
    });
  }

  const redPnr = await prisma.pnr.findFirst({ where: { pnr: 'TEST-RED-01' } });
  if (redPnr) {
    await prisma.activityLog.deleteMany({
      where: { tableName: 'pnrs', recordId: redPnr.id },
    });
    await prisma.activityLog.createMany({
      data: [
        {
          tableName: 'pnrs',
          recordId: redPnr.id,
          fieldName: 'seats',
          oldValue: '60',
          newValue: '50',
        },
        {
          tableName: 'pnrs',
          recordId: redPnr.id,
          fieldName: 'pnr_tl_date',
          oldValue: null,
          newValue: dayOffset(21).toISOString().slice(0, 10),
        },
      ],
    });
  }
}

