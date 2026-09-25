import { describe, expect, it } from 'vitest';
import {
  agentBalance,
  agentMargin,
  agentTotal,
  describeRecovery,
  describeTerm,
  NO_TERMS,
  sumRecoveries,
  validateRecovery,
  validateTerms,
  type AgentTerms,
  type PnrPricing,
} from './agent-money';

const terms = (t: Partial<AgentTerms>): AgentTerms => ({ ...NO_TERMS, ...t });

/** The booking from the owner's worked example (decisions.md, ruling 12). */
const ownersPnr: PnrPricing = { fare: 100_000, airlineTaxes: 20_000 };

describe('agentTotal — the owner’s worked example (ruling 12)', () => {
  // 10 seats, fare 100,000, tax 20,000/seat ticked, charge 5% of base fare.
  // 1,000,000 + 50,000 + 200,000 = 1,250,000. This figure was confirmed by the
  // owner; if this test ever fails, the code is wrong, not the test.
  const money = agentTotal({
    seats: 10,
    pricing: ownersPnr,
    terms: terms({ chargeType: 'pct', chargeValue: 5, chargeTax: true }),
  });

  it('totals exactly PKR 1,250,000', () => {
    expect(money.total).toBe(1_250_000);
  });

  it('breaks down as base 1,000,000 + charge 50,000 + tax 200,000', () => {
    expect(money).toMatchObject({ base: 1_000_000, charge: 50_000, tax: 200_000, discount: 0 });
  });

  it('leaves a margin of 50,000 — the charge alone, never the tax', () => {
    expect(money.margin).toBe(50_000);
  });
});

describe('agentTotal', () => {
  it('is seats × fare when there are no terms at all', () => {
    expect(agentTotal({ seats: 30, pricing: ownersPnr, terms: NO_TERMS })).toMatchObject({
      base: 3_000_000,
      charge: 0,
      discount: 0,
      tax: 0,
      total: 3_000_000,
      margin: 0,
    });
  });

  it('charges a percentage of the base fare, not of the total', () => {
    // 10% of (10 × 100,000) = 100,000 — NOT 10% of base+tax (120,000).
    const money = agentTotal({
      seats: 10,
      pricing: ownersPnr,
      terms: terms({ chargeType: 'pct', chargeValue: 10, chargeTax: true }),
    });
    expect(money.charge).toBe(100_000);
    expect(money.total).toBe(1_000_000 + 100_000 + 200_000);
  });

  it('charges a per-seat amount for every seat the agent holds', () => {
    const money = agentTotal({
      seats: 12,
      pricing: ownersPnr,
      terms: terms({ chargeType: 'per_seat', chargeValue: 2_500 }),
    });
    expect(money.charge).toBe(30_000);
    expect(money.total).toBe(1_230_000);
  });

  it('subtracts a discount and reports it as a negative margin', () => {
    const money = agentTotal({
      seats: 10,
      pricing: ownersPnr,
      terms: terms({ discountType: 'per_seat', discountValue: 5_000 }),
    });
    expect(money.discount).toBe(50_000);
    expect(money.total).toBe(950_000);
    expect(money.margin).toBe(-50_000);
  });

  it('adds the airline tax only when the tick is on', () => {
    const untaxed = agentTotal({ seats: 10, pricing: ownersPnr, terms: NO_TERMS });
    const taxed = agentTotal({ seats: 10, pricing: ownersPnr, terms: terms({ chargeTax: true }) });
    expect(untaxed.tax).toBe(0);
    expect(taxed.tax).toBe(200_000);
  });

  it('adds no tax when the booking has none recorded, even if ticked', () => {
    const money = agentTotal({
      seats: 10,
      pricing: { fare: 100_000, airlineTaxes: null },
      terms: terms({ chargeTax: true }),
    });
    expect(money.tax).toBe(0);
    expect(money.total).toBe(1_000_000);
  });

  it('keeps the real airline figures exact — 45,862 tax against a 115,170 fare', () => {
    // The live pair quoted in ruling 11, proving the tax is per seat.
    const money = agentTotal({
      seats: 7,
      pricing: { fare: 115_170, airlineTaxes: 45_862 },
      terms: terms({ chargeTax: true }),
    });
    expect(money.base).toBe(806_190);
    expect(money.tax).toBe(321_034);
    expect(money.total).toBe(1_127_224);
  });

  it('sums in paisa, so a fractional percentage does not drift', () => {
    // 7.5% of 333,333.33 = 24,999.99975 → 25,000.00 to the paisa.
    const money = agentTotal({
      seats: 1,
      pricing: { fare: 333_333.33, airlineTaxes: null },
      terms: terms({ chargeType: 'pct', chargeValue: 7.5 }),
    });
    expect(money.charge).toBe(25_000);
    expect(money.total).toBe(358_333.33);
  });

  it('does not accumulate float error across many seats', () => {
    const money = agentTotal({
      seats: 99,
      pricing: { fare: 0.1, airlineTaxes: 0.2 },
      terms: terms({ chargeTax: true }),
    });
    expect(money.base).toBe(9.9);
    expect(money.tax).toBe(19.8);
    expect(money.total).toBe(29.7);
  });

  it('returns zeroes for a released (zero-seat) assignment instead of throwing', () => {
    expect(agentTotal({ seats: 0, pricing: ownersPnr, terms: terms({ chargeTax: true }) })).toMatchObject({
      base: 0,
      tax: 0,
      total: 0,
    });
  });
});

describe('agentMargin', () => {
  it('is the charge when there is no discount', () => {
    expect(
      agentMargin({ seats: 10, pricing: ownersPnr, terms: terms({ chargeType: 'pct', chargeValue: 5 }) })
    ).toBe(50_000);
  });

  it('never counts tax as profit (ruling 15)', () => {
    const withTax = agentMargin({
      seats: 10,
      pricing: ownersPnr,
      terms: terms({ chargeType: 'pct', chargeValue: 5, chargeTax: true }),
    });
    const withoutTax = agentMargin({
      seats: 10,
      pricing: ownersPnr,
      terms: terms({ chargeType: 'pct', chargeValue: 5 }),
    });
    expect(withTax).toBe(withoutTax);
  });

  it('is zero on a plain hand-over at cost', () => {
    expect(agentMargin({ seats: 30, pricing: ownersPnr, terms: NO_TERMS })).toBe(0);
  });
});

describe('validateTerms', () => {
  const ctx = { seats: 10, pricing: ownersPnr };

  it('accepts no terms at all', () => {
    expect(validateTerms(NO_TERMS, ctx)).toBeNull();
  });

  it('accepts a charge on its own and a discount on its own', () => {
    expect(validateTerms(terms({ chargeType: 'pct', chargeValue: 5 }), ctx)).toBeNull();
    expect(validateTerms(terms({ discountType: 'per_seat', discountValue: 5_000 }), ctx)).toBeNull();
  });

  it('refuses a charge and a discount together (ruling 10)', () => {
    const res = validateTerms(
      terms({ chargeType: 'pct', chargeValue: 5, discountType: 'pct', discountValue: 2 }),
      ctx
    );
    expect(res?.error).toContain('cannot both be set');
  });

  it('refuses a type with no value', () => {
    expect(validateTerms(terms({ chargeType: 'pct', chargeValue: null }), ctx)?.error).toContain(
      'Enter the charge amount'
    );
  });

  it('refuses a negative or unparseable amount', () => {
    expect(validateTerms(terms({ chargeType: 'per_seat', chargeValue: -1 }), ctx)?.error).toContain(
      'cannot be negative'
    );
    expect(validateTerms(terms({ chargeType: 'per_seat', chargeValue: NaN }), ctx)?.error).toContain(
      'Enter the charge amount'
    );
  });

  it('refuses zero, which is not a term but the absence of one', () => {
    expect(validateTerms(terms({ discountType: 'pct', discountValue: 0 }), ctx)?.error).toContain('zero');
  });

  it('refuses a discount larger than the seats cost', () => {
    // 101% of the base would leave the company paying the agent to take seats.
    const res = validateTerms(terms({ discountType: 'pct', discountValue: 101 }), ctx);
    expect(res?.error).toContain('more than 100%');

    const perSeat = validateTerms(terms({ discountType: 'per_seat', discountValue: 100_001 }), ctx);
    expect(perSeat?.error).toContain('owing the agent');
  });

  it('allows a 100% discount — a free hand-over is a decision, not an error', () => {
    expect(validateTerms(terms({ discountType: 'pct', discountValue: 100 }), ctx)).toBeNull();
  });

  it('allows a charge above 100%, because a strong market is the owner’s call', () => {
    expect(validateTerms(terms({ chargeType: 'pct', chargeValue: 150 }), ctx)).toBeNull();
  });
});

describe('describeTerm', () => {
  it('reads as a person would say it', () => {
    expect(describeTerm('none', null)).toBe('None');
    expect(describeTerm('pct', 5)).toBe('5% of fare');
    expect(describeTerm('per_seat', 2000)).toBe('PKR 2,000 per seat');
  });
});

describe('sumRecoveries', () => {
  it('adds payments to the paisa, without float drift', () => {
    expect(sumRecoveries([0.1, 0.2])).toBe(0.3);
    expect(sumRecoveries([150_000, 300_000.55, 49_999.45])).toBe(500_000);
  });

  it('is zero for no payments', () => {
    expect(sumRecoveries([])).toBe(0);
  });

  it('ignores a value that is not money rather than producing NaN', () => {
    expect(sumRecoveries([100, NaN, Infinity, -5])).toBe(100);
  });
});

describe('agentBalance', () => {
  const base = {
    seats: 10,
    pricing: ownersPnr,
    terms: terms({ chargeType: 'pct', chargeValue: 5, chargeTax: true }),
  };

  it('starts with the whole total outstanding', () => {
    expect(agentBalance({ ...base, recoveries: [] })).toMatchObject({
      total: 1_250_000,
      recovered: 0,
      outstanding: 1_250_000,
      credit: 0,
    });
  });

  it('moves the outstanding balance by exactly what was recorded', () => {
    const one = agentBalance({ ...base, recoveries: [150_000] });
    expect(one.recovered).toBe(150_000);
    expect(one.outstanding).toBe(1_100_000);

    const two = agentBalance({ ...base, recoveries: [150_000, 350_000] });
    expect(two.recovered).toBe(500_000);
    expect(two.outstanding).toBe(750_000);
  });

  it('settles to zero when the total is paid exactly', () => {
    expect(agentBalance({ ...base, recoveries: [1_250_000] })).toMatchObject({
      outstanding: 0,
      credit: 0,
    });
  });

  it('shows an overpayment as credit, not as a negative balance', () => {
    // Ruling 13: an agent's money can stand as credit. A screen reading
    // "−50,000 outstanding" would look like a bug instead.
    expect(agentBalance({ ...base, recoveries: [1_300_000] })).toMatchObject({
      outstanding: 0,
      credit: 50_000,
    });
  });

  it('keeps the terms visible alongside the balance', () => {
    expect(agentBalance({ ...base, recoveries: [100] })).toMatchObject({
      base: 1_000_000,
      charge: 50_000,
      tax: 200_000,
      margin: 50_000,
    });
  });
});

describe('validateRecovery', () => {
  const today = '2026-09-20';

  it('accepts a payment received today', () => {
    expect(validateRecovery(150_000, today, today)).toEqual({
      date: new Date('2026-09-20T00:00:00.000Z'),
    });
  });

  it('accepts a payment received in the past', () => {
    expect(validateRecovery(1, '2026-01-31', today)).toHaveProperty('date');
  });

  it('refuses a missing, NaN or infinite amount', () => {
    expect(validateRecovery(null, today, today)).toHaveProperty('error');
    expect(validateRecovery(NaN, today, today)).toHaveProperty('error');
    expect(validateRecovery(Infinity, today, today)).toHaveProperty('error');
  });

  it('refuses zero and negative amounts, pointing at deletion instead', () => {
    const res = validateRecovery(-5000, today, today);
    expect('error' in res && res.error).toContain('delete it instead');
    expect(validateRecovery(0, today, today)).toHaveProperty('error');
  });

  it('refuses a missing or malformed date', () => {
    expect(validateRecovery(100, null, today)).toHaveProperty('error');
    expect(validateRecovery(100, '20-09-2026', today)).toHaveProperty('error');
  });

  it('refuses an impossible date that JavaScript would roll over', () => {
    // new Date('2026-02-30') silently becomes 2 March.
    const res = validateRecovery(100, '2026-02-30', today);
    expect('error' in res && res.error).toContain('not a real date');
  });

  it('refuses a payment dated in the future', () => {
    const res = validateRecovery(100, '2026-09-21', today);
    expect('error' in res && res.error).toContain('future date');
  });
});

describe('describeRecovery', () => {
  it('never includes the payment reference (rule 8)', () => {
    const line = describeRecovery(150_000, '2026-09-20', 'bank transfer');
    expect(line).toBe('PKR 150,000 received on 2026-09-20 by bank transfer');
    expect(line).not.toContain('CHQ');
  });

  it('reads sensibly with no method recorded', () => {
    expect(describeRecovery(5_000, '2026-09-20', null)).toBe('PKR 5,000 received on 2026-09-20');
  });
});
