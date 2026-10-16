import { describe, expect, it } from 'vitest';
import { flagPastDates, draftNotes } from './draft-checks';
import { parseRawLlmJson } from './parse-booking';

const draft = (fields: Record<string, unknown>) => parseRawLlmJson(JSON.stringify({ bookings: [fields] }), 'x')[0];

describe('flagPastDates — the 2023/2024 year bug (2026-10-05)', () => {
  it('marks a past outbound date low confidence, with a note', () => {
    const d = flagPastDates(draft({ outboundDate: { value: '2023-11-14', confidence: 'high' } }), '2026-10-05');
    expect(d.outboundDate).toMatchObject({ value: '2023-11-14', confidence: 'low' });
    expect(d.outboundDate.notes).toContain('check the year');
  });

  it('never changes the date itself', () => {
    expect(flagPastDates(draft({ inboundDate: { value: '2024-01-02', confidence: 'high' } }), '2026-10-05').inboundDate.value).toBe('2024-01-02');
  });

  it('leaves today and future dates alone', () => {
    const d = flagPastDates(
      draft({ outboundDate: { value: '2026-10-05', confidence: 'high' }, pnrTlDate: { value: '2026-11-01', confidence: 'medium' } }),
      '2026-10-05'
    );
    expect(d.outboundDate.confidence).toBe('high');
    expect(d.pnrTlDate.confidence).toBe('medium');
  });

  it('does not check dates that are naturally in the past', () => {
    const d = flagPastDates(draft({ requestDate: { value: '2026-03-13', confidence: 'high' }, roundIssuanceDate: { value: '2026-04-08', confidence: 'high' } }), '2026-10-05');
    expect(d.requestDate.confidence).toBe('high');
    expect(d.roundIssuanceDate.confidence).toBe('high');
  });

  it('draftNotes lists what the reviewer should check', () => {
    const d = flagPastDates(draft({ outboundDate: { value: '2023-11-14', confidence: 'high' }, roundDeadlineDate: { value: '2023-10-22', confidence: 'high' } }), '2026-10-05');
    expect(draftNotes(d)).toEqual([
      'Outbound date 2023-11-14 is in the past — check the year.',
      'EMD deadline 2023-10-22 is in the past — check the year.',
    ]);
  });
});

describe('parseRawLlmJson — the structured reply shape', () => {
  it('reads {"bookings": [...]} and strips a <think> preamble', () => {
    const d = parseRawLlmJson('<think>hmm</think>{"bookings":[{"pnr":{"value":"KQX7LM","confidence":"high"}},{"pnr":{"value":"AB12CD","confidence":"medium"}}]}', 'x');
    expect(d.map((x) => x.pnr.value)).toEqual(['KQX7LM', 'AB12CD']);
  });
});

describe('tableToBookings / parseRawLlmJson — the table reply (2026-10-05)', () => {
  const table = JSON.stringify({
    columns: ['pnr', 'seats', 'outboundFlightCode', 'roundEmdAmount'],
    rows: [
      ['72HTPS', 50, 'SV 739', 948675],
      ['723OFI', 50, 'SV 735', null],
    ],
    unsure: [[1, 'pnr']],
  });

  it('one draft per row, values read by column', () => {
    const d = parseRawLlmJson(table, 'x', 'gemini/m', 'high');
    expect(d.map((x) => x.pnr.value)).toEqual(['72HTPS', '723OFI']);
    expect(d[0].seats).toMatchObject({ value: 50, confidence: 'high' });
    expect(d[0].roundEmdAmount.value).toBe(948675);
  });

  it('marks the values the model was unsure of as low confidence, only those', () => {
    const d = parseRawLlmJson(table, 'x', 'gemini/m', 'high');
    expect(d[1].pnr.confidence).toBe('low');
    expect(d[0].pnr.confidence).toBe('high');
  });

  it('a null cell is empty and low confidence; an absent column is empty', () => {
    const d = parseRawLlmJson(table, 'x', 'gemini/m', 'high');
    expect(d[1].roundEmdAmount).toMatchObject({ value: null, confidence: 'low' });
    expect(d[0].fare).toMatchObject({ value: null, confidence: 'low' });
  });

  it("uses the provider's confidence for found values", () => {
    expect(parseRawLlmJson(table, 'x', 'groq/m', 'medium')[0].seats.confidence).toBe('medium');
  });
});

