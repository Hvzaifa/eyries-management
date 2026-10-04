import { prisma } from '@/lib/prisma';
import { pnrBranchFilter, type AuthUser } from '@/lib/auth';
import { agentPageFilter } from '@/lib/agents';
import { duesForAssignment, type AgentDues } from '@/lib/agent-dues';
import { nextEmdSuggestion } from '@/lib/emd';
import { RECEIVABLE_PNR_STATUSES, seatTypeOf, type ReceivableLine } from '@/lib/agent-receivables';

/**
 * Agents and their money on each booking, read once for both Agents pages.
 *
 * Scoping (owner, 2026-10-05): head office sees every agent and every booking.
 * A branch sees the agents it has sold seats to (plus any it created), and
 * **only its own bookings' figures** — Karachi never sees Rawalpindi's recovery.
 * Both are applied in the query, not after fetching, so a guessed URL reads
 * nothing extra. Only active and completed bookings count.
 */

export interface AgentBookingLine extends ReceivableLine {
  assignmentId: string;
  pnrId: string;
  pnrCode: string;
  srNo: number;
  pnrStatus: string;
  pnrSeats: number;
  pnrBranchId: string | null;
  branchName: string | null;
  sector: string | null;
  outboundDate: string | null;
  airlineCode: string | null;
  dues: AgentDues;
}

export interface AgentWithLines {
  id: string;
  name: string;
  b2bCode: string | null;
  contactEmails: string[];
  contactPhone: string | null;
  active: boolean;
  createdAt: Date;
  createdByBranchId: string | null;
  createdByBranchName: string | null;
  lines: AgentBookingLine[];
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Every agent this user may see, or one agent when `agentId` is given. */
export async function loadAgentLedger(user: AuthUser, todayIso: string, agentId?: string): Promise<AgentWithLines[]> {
  const agentScope = agentPageFilter(user);
  const pnrScope = pnrBranchFilter(user);
  if (agentScope === null || pnrScope === null) return [];

  const agents = await prisma.agent.findMany({
    where: { ...(agentId ? { id: agentId } : {}), ...agentScope },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      createdByBranch: { select: { name: true } },
      assignments: {
        where: { releasedAt: null, pnr: { ...pnrScope, status: { in: RECEIVABLE_PNR_STATUSES } } },
        orderBy: { pnr: { srNo: 'asc' } },
        include: {
          recoveries: { select: { amount: true } },
          pnr: {
            select: {
              id: true,
              pnr: true,
              srNo: true,
              seats: true,
              sector: true,
              segment: true,
              status: true,
              fare: true,
              airlineTaxes: true,
              requestDate: true,
              outboundDate: true,
              branchId: true,
              branch: { select: { name: true } },
              airline: { select: { code: true } },
              emdRounds: { select: { roundNumber: true, status: true, emdAmount: true, deadlineDate: true } },
              ticketing: { select: { ticketIssuanceDeadline: true } },
            },
          },
        },
      },
    },
  });

  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    b2bCode: a.b2bCode,
    contactEmails: a.contactEmails,
    contactPhone: a.contactPhone,
    active: a.active,
    createdAt: a.createdAt,
    createdByBranchId: a.createdByBranchId,
    createdByBranchName: a.createdByBranch?.name ?? null,
    lines: a.assignments.map((asg) => {
      const p = asg.pnr;
      // The agent's share of the next EMD, from the airline's own policy — the
      // "next round to collect" line of the per-round schedule. Null when no
      // policy covers the airline, so no guessed line appears.
      const upcoming = nextEmdSuggestion({
        roundsIssued: p.emdRounds.filter((r) => r.status === 'issued').length,
        seats: p.seats,
        fare: Number(p.fare),
        airlineCode: p.airline?.code ?? null,
        segment: p.segment,
        requestDateIso: iso(p.requestDate),
        outboundDateIso: iso(p.outboundDate),
        todayIso,
      });
      const { dues, margin } = duesForAssignment({
        agentSeats: asg.seats,
        pnrSeats: p.seats,
        fare: Number(p.fare),
        airlineTaxes: p.airlineTaxes === null ? null : Number(p.airlineTaxes),
        chargeType: asg.chargeType,
        chargeValue: asg.chargeValue === null ? null : Number(asg.chargeValue),
        discountType: asg.discountType,
        discountValue: asg.discountValue === null ? null : Number(asg.discountValue),
        chargeTax: asg.chargeTax,
        recoveries: asg.recoveries.map((r) => Number(r.amount)),
        rounds: p.emdRounds.map((r) => ({
          roundNumber: r.roundNumber,
          status: r.status,
          emdAmount: Number(r.emdAmount),
          deadlineDate: iso(r.deadlineDate),
        })),
        ticketIssuanceDeadline: iso(p.ticketing?.ticketIssuanceDeadline ?? null),
        upcomingRoundAmount: upcoming.amount,
      });
      return {
        assignmentId: asg.id,
        pnrId: p.id,
        pnrCode: p.pnr,
        srNo: p.srNo,
        pnrStatus: p.status,
        pnrSeats: p.seats,
        pnrBranchId: p.branchId,
        branchName: p.branch?.name ?? null,
        sector: p.sector,
        outboundDate: iso(p.outboundDate),
        airlineCode: p.airline?.code ?? null,
        seatType: seatTypeOf(p.segment),
        seats: asg.seats,
        receivable: dues.final.total,
        recovered: dues.final.recovered,
        balance: dues.final.outstanding,
        credit: dues.final.credit,
        margin,
        dues,
      };
    }),
  }));
}
