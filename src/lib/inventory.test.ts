import { describe, expect, it } from 'vitest';
import {
  holderFilterKeys,
  holderKind,
  holderLabel,
  liveAgentSeats,
  seatLedger,
  validateAssign,
  validateMove,
  validateRelease,
  validateSeatsChange,
} from './inventory';

const ledgerOf = (seats: number, assigned: number[], bot = 0) =>
  seatLedger({ seats, assignments: assigned.map((s) => ({ seats: s })), botAllotment: bot });

describe('seatLedger', () => {
  it('starts a new booking wholly unassigned', () => {
    expect(ledgerOf(30, [])).toMatchObject({ seats: 30, agentSeats: 0, botAllotment: 0, unassigned: 30 });
  });

  it('splits seats between agents, the bot and what is left', () => {
    expect(ledgerOf(30, [10, 5], 5)).toMatchObject({
      agentSeats: 15,
      botAllotment: 5,
      unassigned: 10,
    });
  });

  it('ignores released assignments — the seats come back', () => {
    const l = seatLedger({
      seats: 30,
      assignments: [
        { seats: 10, releasedAt: null },
        { seats: 8, releasedAt: new Date('2026-09-01') },
      ],
    });
    expect(l.agentSeats).toBe(10);
    expect(l.unassigned).toBe(20);
  });

  it('never reports negative unassigned, and says so when the rows do not add up', () => {
    // Should be impossible — every write checks the invariant — but a clamped 0
    // with no warning would be a lie, and a negative limit blocks every action.
    const l = ledgerOf(10, [12]);
    expect(l.unassigned).toBe(0);
    expect(l.overAllocated).toBe(true);
    expect(ledgerOf(10, [4]).overAllocated).toBe(false);
  });

  it('treats a fully assigned booking as having nothing left', () => {
    expect(ledgerOf(30, [30]).unassigned).toBe(0);
  });
});

describe('liveAgentSeats', () => {
  it('counts only assignments that have not been released', () => {
    expect(liveAgentSeats([{ seats: 5 }, { seats: 7, releasedAt: new Date() }])).toBe(5);
    expect(liveAgentSeats([])).toBe(0);
  });
});

describe('validateAssign', () => {
  it('allows up to exactly the unassigned seats', () => {
    expect(validateAssign(ledgerOf(30, [10]), 20)).toBeNull();
    expect(validateAssign(ledgerOf(30, []), 30)).toBeNull();
  });

  it('refuses one seat more than is unassigned, naming both numbers', () => {
    const err = validateAssign(ledgerOf(30, [10]), 21);
    expect(err).toMatch(/only 20 of the 30 seats on this booking are still with the company/);
  });

  it('gives a useful message when nothing is left', () => {
    expect(validateAssign(ledgerOf(30, [30]), 1)).toMatch(/already assigned/);
  });

  it('rejects zero, negative, fractional and non-finite requests', () => {
    const l = ledgerOf(30, []);
    for (const bad of [0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateAssign(l, bad)).toMatch(/positive whole number/);
    }
  });

  it('does not let the bot allotment be given away to an agent', () => {
    // 30 seats, 25 on sale through the bot: only 5 may go to an agent.
    expect(validateAssign(ledgerOf(30, [], 25), 6)).toMatch(/only 5 of the 30/);
    expect(validateAssign(ledgerOf(30, [], 25), 5)).toBeNull();
  });
});

describe('validateRelease', () => {
  it('allows releasing part or all of what an agent holds', () => {
    expect(validateRelease(20, 5)).toBeNull();
    expect(validateRelease(20, 20)).toBeNull();
  });

  it('refuses releasing more than the agent holds', () => {
    expect(validateRelease(20, 21)).toMatch(/this agent holds 20/);
  });

  it('rejects nonsense amounts', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(validateRelease(20, bad)).toMatch(/positive whole number/);
    }
  });
});

describe('validateMove', () => {
  it('moves seats between two agents without needing unassigned seats', () => {
    expect(validateMove(20, 20, false)).toBeNull();
    expect(validateMove(20, 5, false)).toBeNull();
  });

  it('refuses moving more than the losing agent holds', () => {
    expect(validateMove(20, 25, false)).toMatch(/this agent holds 20/);
  });

  it('refuses a move to the same agent', () => {
    expect(validateMove(20, 5, true)).toMatch(/different agent/);
  });
});

describe('validateSeatsChange', () => {
  it('allows raising the seats, or lowering to exactly what is committed', () => {
    expect(validateSeatsChange(40, { agentSeats: 10 })).toBeNull();
    expect(validateSeatsChange(10, { agentSeats: 10 })).toBeNull();
  });

  it('refuses dropping the seats below what agents and the bot hold', () => {
    expect(validateSeatsChange(9, { agentSeats: 10 })).toMatch(/cannot be reduced to 9/);
    expect(validateSeatsChange(14, { agentSeats: 10, botAllotment: 5 })).toMatch(/15 seats already assigned/);
  });

  it('leaves an untouched booking alone', () => {
    expect(validateSeatsChange(0, { agentSeats: 0 })).toBeNull();
  });
});

describe('holderKind', () => {
  it('reads as unassigned, agent, bot or mixed', () => {
    expect(holderKind(ledgerOf(30, []), 0)).toBe('unassigned');
    expect(holderKind(ledgerOf(30, [30]), 1)).toBe('agent');
    expect(holderKind(ledgerOf(30, [], 30), 0)).toBe('bot');
    expect(holderKind(ledgerOf(30, [10]), 1)).toBe('mixed'); // 20 still unassigned
    expect(holderKind(ledgerOf(30, [10, 20]), 2)).toBe('mixed'); // two agents
    expect(holderKind(ledgerOf(30, [15], 15), 1)).toBe('mixed'); // agent + bot
  });

  it('calls a booking with no seats unassigned rather than crashing', () => {
    expect(holderKind(ledgerOf(0, []), 0)).toBe('unassigned');
  });
});

describe('holderLabel', () => {
  const agents = (...parts: [string, number][]) => parts.map(([name, seats]) => ({ name, seats }));

  it('says Company Investment when nothing has been handed over', () => {
    expect(holderLabel(ledgerOf(30, []), [])).toBe('Company Investment');
    expect(holderLabel(ledgerOf(0, []), [])).toBe('Company Investment');
  });

  it('names the agent alone when the whole booking is theirs', () => {
    // It belongs to them now — "Company Investment" no longer describes it.
    expect(holderLabel(ledgerOf(50, [50]), agents(['QFC Group', 50]))).toBe('QFC Group');
  });

  it('shows the seat split when the company still holds part of it', () => {
    expect(holderLabel(ledgerOf(50, [20]), agents(['QFC Group', 20]))).toBe(
      'QFC Group (20) + Company (30)'
    );
  });

  it('lists every agent when several share the booking', () => {
    expect(holderLabel(ledgerOf(50, [20, 30]), agents(['QFC Group', 20], ['KJ Travels', 30]))).toBe(
      'QFC Group + KJ Travels'
    );
  });

  it('lists agents with counts when they share it AND seats remain with the company', () => {
    expect(
      holderLabel(ledgerOf(50, [20, 20]), agents(['QFC Group', 20], ['KJ Travels', 20]))
    ).toBe('QFC Group (20) + KJ Travels (20) + Company (10)');
  });

  it('names the bot like any other holder', () => {
    expect(holderLabel(ledgerOf(30, [], 30), [])).toBe('B2C / Bot');
    expect(holderLabel(ledgerOf(30, [], 10), [])).toBe('B2C / Bot (10) + Company (20)');
    expect(holderLabel(ledgerOf(30, [10], 10), agents(['QFC Group', 10]))).toBe(
      'QFC Group (10) + B2C / Bot (10) + Company (10)'
    );
  });

  it('ignores an agent holding no seats', () => {
    expect(holderLabel(ledgerOf(30, [30]), agents(['QFC Group', 30], ['Released Co', 0]))).toBe(
      'QFC Group'
    );
  });
});

describe('holderFilterKeys', () => {
  const agents = (...parts: [string, number][]) => parts.map(([name, seats]) => ({ name, seats }));

  it('finds an untouched booking under Company Investment', () => {
    expect(holderFilterKeys(ledgerOf(30, []), [])).toEqual(['Company Investment']);
  });

  it('finds a fully transferred booking under its agent only', () => {
    expect(holderFilterKeys(ledgerOf(50, [50]), agents(['QFC Group', 50]))).toEqual(['QFC Group']);
  });

  it('finds a part-transferred booking under BOTH the agent and the company', () => {
    expect(holderFilterKeys(ledgerOf(50, [20]), agents(['QFC Group', 20]))).toEqual([
      'QFC Group',
      'Company Investment',
    ]);
  });

  it('finds a shared booking under every agent on it', () => {
    expect(
      holderFilterKeys(ledgerOf(50, [20, 30]), agents(['QFC Group', 20], ['KJ Travels', 30]))
    ).toEqual(['QFC Group', 'KJ Travels']);
  });

  it('includes the bot when it holds seats', () => {
    expect(holderFilterKeys(ledgerOf(30, [], 30), [])).toEqual(['B2C / Bot']);
  });
});
