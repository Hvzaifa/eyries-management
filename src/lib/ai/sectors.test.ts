import { describe, expect, it } from 'vitest';
import { arrivalDateFromTimes, parseLuggage, splitSectors } from './sectors';

describe('splitSectors', () => {
  const s = (from: string, to: string, departureDate: string | null) => ({ from, to, departureDate });

  it('starts the return at the first sector two or more days after the one before', () => {
    const r = splitSectors([s('ISB', 'JED', '2026-06-11'), s('JED', 'ISB', '2026-06-25')]);
    expect(r.outbound.map((x) => x.to)).toEqual(['JED']);
    expect(r.inbound.map((x) => x.to)).toEqual(['ISB']);
    expect(r.certain).toBe(true);
  });

  it('keeps a same-day or next-day sector as a connection', () => {
    const r = splitSectors([
      s('SKT', 'DOH', '2026-08-20'), s('DOH', 'JED', '2026-08-21'), s('JED', 'DOH', '2026-09-09'), s('DOH', 'SKT', '2026-09-09'),
    ]);
    expect(r.outbound.map((x) => x.to)).toEqual(['DOH', 'JED']);
    expect(r.inbound.map((x) => x.to)).toEqual(['DOH', 'SKT']);
  });

  it('ignores the destination: a trip home is still split by its dates', () => {
    // The export names the home city as the destination on ~1,300 rows.
    const r = splitSectors([s('ISB', 'JED', '2026-06-11'), s('JED', 'ISB', '2026-06-25')]);
    expect(r.inbound).toHaveLength(1);
  });

  it('one sector, or sectors days apart only at the end, need no guess', () => {
    expect(splitSectors([s('ISB', 'RUH', '2026-06-11')])).toMatchObject({ inbound: [], certain: true });
    expect(splitSectors([s('ISB', 'DXB', '2026-06-11'), s('DXB', 'RUH', '2026-06-11')])).toMatchObject({ inbound: [], certain: true });
  });

  it('without every date, splits only a round trip home with an even count, and marks it uncertain', () => {
    expect(splitSectors([s('ISB', 'JED', null), s('JED', 'ISB', null)])).toMatchObject({ certain: false });
    expect(splitSectors([s('ISB', 'JED', null), s('JED', 'ISB', null)]).inbound).toHaveLength(1);
    expect(splitSectors([s('ISB', 'DXB', null), s('DXB', 'JED', null), s('JED', 'ISB', null)])).toMatchObject({ inbound: [], certain: false });
  });
});

describe('parseLuggage', () => {
  it('reads pieces and weight; the hand carry is ignored', () => {
    expect(parseLuggage('1 PC 30KG - 7 KG')).toEqual({ pieces: 1, kg: 30 });
    expect(parseLuggage('1 PC 23KG 7KG')).toEqual({ pieces: 1, kg: 23 });
    expect(parseLuggage('2PC 23 KG')).toEqual({ pieces: 2, kg: 23 });
    expect(parseLuggage('30KG')).toEqual({ pieces: null, kg: 30 });
    expect(parseLuggage('2 PCS')).toEqual({ pieces: 2, kg: null });
    expect(parseLuggage('NIL')).toEqual({ pieces: null, kg: null });
    expect(parseLuggage(null)).toEqual({ pieces: null, kg: null });
  });
});

describe('arrivalDateFromTimes', () => {
  it('lands the next day when it lands at an earlier time than it left', () => {
    expect(arrivalDateFromTimes('2026-06-30', '18:10', '01:10')).toBe('2026-07-01');
    expect(arrivalDateFromTimes('2026-12-31', '23:00', '02:00')).toBe('2027-01-01');
  });

  it('lands the same day otherwise', () => {
    expect(arrivalDateFromTimes('2026-06-30', '09:50', '12:05')).toBe('2026-06-30');
    expect(arrivalDateFromTimes('2026-06-30', '09:50', '09:50')).toBe('2026-06-30');
  });

  it('says nothing without a date or both times', () => {
    expect(arrivalDateFromTimes(null, '18:10', '01:10')).toBeNull();
    expect(arrivalDateFromTimes('2026-06-30', null, '01:10')).toBeNull();
    expect(arrivalDateFromTimes('2026-06-30', '18:10', null)).toBeNull();
  });
});
