import { describe, it, expect } from 'vitest';
import { unallocatedSeats, validateSplit, seatsGivenToChildren } from './seats';

describe('unallocatedSeats', () => {
  it('is the PNR\'s own seat count', () => {
    expect(unallocatedSeats({ seats: 40 })).toBe(40);
  });

  it('does NOT subtract past allocations — seats is already net of them', () => {
    // The owner's worked example: a 30-seat parent split by 10 shows 20 seats.
    // Those 20 are all still splittable; subtracting the 10-seat allocation row
    // again would offer only 10.
    const parentAfterSplit = { seats: 20 };
    expect(unallocatedSeats(parentAfterSplit)).toBe(20);
  });

  it('never goes negative on legacy parents whose children outnumber their seats', () => {
    // Live data has parents like seats=10 with 20 seats recorded across children,
    // because the import stored each row's own seats. The old formula returned -10.
    expect(unallocatedSeats({ seats: 10 })).toBe(10);
  });
});

describe('validateSplit', () => {
  it('allows a split within the remaining seats', () => {
    expect(validateSplit(40, 10)).toBeNull();
  });

  it('allows allocating every remaining seat', () => {
    expect(validateSplit(40, 40)).toBeNull();
  });

  it('rejects one seat too many', () => {
    expect(validateSplit(40, 41)).toMatch(/only holds 40 seats/);
  });

  it('rejects zero, negative and fractional requests', () => {
    expect(validateSplit(40, 0)).toMatch(/positive whole number/);
    expect(validateSplit(40, -5)).toMatch(/positive whole number/);
    expect(validateSplit(40, 2.5)).toMatch(/positive whole number/);
    expect(validateSplit(40, NaN)).toMatch(/positive whole number/);
  });

  it('pluralises the message correctly for a single seat', () => {
    expect(validateSplit(1, 2)).toMatch(/only holds 1 seat\./);
  });

  it('allows a second split of the full remainder after a first split', () => {
    // 30-seat parent, 10 split away -> parent now 20. A second split of 20 must
    // be allowed; the double-counting bug capped it at 10.
    const parentSeatsAfterFirstSplit = 20;
    expect(validateSplit(parentSeatsAfterFirstSplit, 20)).toBeNull();
  });
});

describe('seatsGivenToChildren', () => {
  it('sums the allocation rows', () => {
    expect(seatsGivenToChildren([{ seatsAllocated: 10 }, { seatsAllocated: 12 }])).toBe(22);
  });

  it('is zero when nothing has been split', () => {
    expect(seatsGivenToChildren([])).toBe(0);
  });
});
