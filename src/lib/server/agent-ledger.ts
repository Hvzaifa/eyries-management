import { prisma } from '@/lib/prisma';
import { pnrBranchFilter, type AuthUser } from '@/lib/auth';
import { agentPageFilter } from '@/lib/agents';
import { duesForAssignment, type AgentDues } from '@/lib/agent-dues';
import { nextEmdSuggestion } from '@/lib/emd';
import type { Prisma } from '@prisma/client';
import { RECEIVABLE_PNR_STATUSES, seatTypeOf, unbookedRemaining, type ReceivableLine } from '@/lib/agent-receivables';
import { lookupLabel } from '@/lib/lookups';

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
  dtsCode: string | null;
  address: string | null;
  iataNumber: string | null;
  active: boolean;
  createdAt: Date;
  createdByBranchId: string | null;
  createdByBranchName: string | null;
  lines: AgentBookingLine[];
  /**
   * Owed on bookings not yet in the system (owner, 2026-10-29): the stored
   * excess from the ageing report, less the receivable added since. Measured
   * against the agent's bookings in every branch, whoever is looking.
   */
  notInSystem: number;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Every agent this user may see, or one agent when `agentId` is given. */
export async function loadAgentLedger(user: AuthUser, todayIso: string, agentId?: string): Promise<AgentWithLines[]> {
  const agentScope = agentPageFilter(user);
  const pnrScope = pnrBranchFilter(user);
  if (agentScope === null || pnrScope === null) return [];

  const agents = await loadLedger({ ...(agentId ? { id: agentId } : {}), ...agentScope }, pnrScope, todayIso);

  // The excess is the agent's, not a branch's: what has been added since is
  // measured across every branch, so a branch sees the same figure Head Office
  // does (owner, 2026-10-29).
  const withExcess = agents.filter((a) => a.unbookedBalance !== null);
  const everywhere =
    withExcess.length === 0 || Object.keys(pnrScope).length === 0
      ? agents
      : await loadLedger({ id: { in: withExcess.map((a) => a.id) } }, {}, todayIso);
  const receivableNow = new Map(everywhere.map((a) => [a.id, a.lines.reduce((s, l) => s + Math.round(l.receivable * 100), 0) / 100]));

  return agents.map(({ unbookedBalance, unbookedBaseline, ...a }) => ({
    ...a,
    notInSystem: unbookedRemaining({ unbookedBalance, baseline: unbookedBaseline, receivableNow: receivableNow.get(a.id) ?? 0 }),
  }));
}

async function loadLedger(
  agentWhere: Prisma.AgentWhereInput,
  pnrScope: Prisma.PnrWhereInput,
  todayIso: string
): Promise<(Omit<AgentWithLines, 'notInSystem'> & { unbookedBalance: number | null; unbookedBaseline: number | null })[]> {
  const agents = await prisma.agent.findMany({
    where: agentWhere,
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      createdByBranch: { select: { name: true, code: true } },
      assignments: {
        where: { releasedAt: null, pnr: { ...pnrScope, status: { in: RECEIVABLE_PNR_STATUSES } } },
        orderBy: { pnr: { srNo: 'asc' } },
        include: {
          recoveries: { select: { amount: true } },
          paybacks: { select: { amount: true } },
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
              branch: { select: { name: true, code: true } },
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
    dtsCode: a.dtsCode,
    address: a.address,
    iataNumber: a.iataNumber,
    active: a.active,
    createdAt: a.createdAt,
    createdByBranchId: a.createdByBranchId,
    createdByBranchName: lookupLabel(a.createdByBranch),
    unbookedBalance: a.unbookedBalance === null ? null : Number(a.unbookedBalance),
    unbookedBaseline: a.unbookedBaseline === null ? null : Number(a.unbookedBaseline),
    lines: a.assignments.map((asg) => {
      const p = asg.pnr;
      // The agent's share of the next EMD, from the airline's own policy — the
      // "next round to collect" line of the per-round schedule. Null when no
      // policy covers the airline, so no guessed line appears.
      //
      // A requested round still counts as issued here (Phase 9 Step 3): asking
      // for its refund ends the money held, not the fact that it was issued, so
      // it must not bring the same EMD back as one to collect. A refunded round
      // still does not count — rounds 3–4 re-issue refunded rounds 1–2.
      const upcoming = nextEmdSuggestion({
        roundsIssued: p.emdRounds.filter((r) => r.status !== 'refunded').length,
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
        penaltyAmount: asg.penaltyAmount === null ? null : Number(asg.penaltyAmount),
        cancelled: p.status === 'cancelled' ? { paybacks: asg.paybacks.map((b) => Number(b.amount)) } : undefined,
      });
      return {
        assignmentId: asg.id,
        pnrId: p.id,
        pnrCode: p.pnr,
        srNo: p.srNo,
        pnrStatus: p.status,
        pnrSeats: p.seats,
        pnrBranchId: p.branchId,
        branchName: lookupLabel(p.branch),
        sector: p.sector,
        outboundDate: iso(p.outboundDate),
        airlineCode: p.airline?.code ?? null,
        seatType: seatTypeOf(p.segment),
        seats: asg.seats,
        receivable: dues.final.total,
        recovered: dues.final.recovered,
        balance: dues.final.outstanding,
        credit: dues.final.credit,
        payBack: dues.final.toPayBack,
        margin,
        dues,
      };
    }),
  }));
}
