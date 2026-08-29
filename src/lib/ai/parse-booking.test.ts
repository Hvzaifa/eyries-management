import { describe, expect, it } from 'vitest';
import { cleanJsonString, parseRawLlmJson } from './parse-booking';

describe('cleanJsonString', () => {
  it('strips ```json code fences', () => {
    const input = '```json\n{"pnr": {"value": "ABC123"}}\n```';
    expect(cleanJsonString(input)).toBe('{"pnr": {"value": "ABC123"}}');
  });

  it('handles clean json without fences', () => {
    const input = '{"pnr": {"value": "XYZ789"}}';
    expect(cleanJsonString(input)).toBe('{"pnr": {"value": "XYZ789"}}');
  });
});

describe('parseRawLlmJson', () => {
  it('extracts all core fields with confidence ratings', () => {
    const rawJson = JSON.stringify({
      pnr: { value: 'SVGRP1', confidence: 'high', notes: 'Found in PNR header' },
      gdsPnr: { value: '1E/ABC99', confidence: 'medium', notes: 'GDS reference' },
      airlineCode: { value: 'SV', confidence: 'high' },
      investorCompany: { value: 'Al-Haramain Travels', confidence: 'high' },
      seats: { value: '45', confidence: 'high' },
      sector: { value: 'ISB-JED-ISB', confidence: 'high' },
      requestDate: { value: '2026-08-20', confidence: 'high' },
      outboundDate: { value: '2026-10-15', confidence: 'high' },
      inboundDate: { value: '2026-10-30', confidence: 'high' },
      fare: { value: '185000', confidence: 'high' },
      airlineTaxes: { value: '25000', confidence: 'medium' },
      psf: { value: 1500, confidence: 'medium' },
      dealPct: { value: 2.5, confidence: 'low', notes: 'Inferred cut' },
      roundIssuanceDate: { value: '2026-08-20', confidence: 'high' },
      roundPaymentPct: { value: 15, confidence: 'high' },
      roundEmdAmount: { value: '1248750', confidence: 'high' },
      roundDeadlineDate: { value: '2026-09-05', confidence: 'high' },
      roundDeadlineTime: { value: '17:00', confidence: 'medium' },
    });

    const parsed = parseRawLlmJson(rawJson, 'Original message text here', 'test-model');

    expect(parsed.pnr.value).toBe('SVGRP1');
    expect(parsed.pnr.confidence).toBe('high');
    expect(parsed.pnr.notes).toBe('Found in PNR header');

    expect(parsed.gdsPnr.value).toBe('1E/ABC99');
    expect(parsed.airlineCode.value).toBe('SV');
    expect(parsed.investorCompany.value).toBe('Al-Haramain Travels');
    expect(parsed.seats.value).toBe(45);
    expect(parsed.sector.value).toBe('ISB-JED-ISB');
    expect(parsed.fare.value).toBe(185000);
    expect(parsed.airlineTaxes.value).toBe(25000);
    expect(parsed.psf.value).toBe(1500);
    expect(parsed.dealPct.value).toBe(2.5);

    expect(parsed.roundIssuanceDate.value).toBe('2026-08-20');
    expect(parsed.roundPaymentPct.value).toBe(15);
    expect(parsed.roundEmdAmount.value).toBe(1248750);
    expect(parsed.roundDeadlineDate.value).toBe('2026-09-05');
    expect(parsed.roundDeadlineTime.value).toBe('17:00');

    expect(parsed.rawPastedText).toBe('Original message text here');
    expect(parsed.modelUsed).toBe('test-model');
  });

  it('handles missing fields gracefully by defaulting to null and low confidence', () => {
    const rawJson = JSON.stringify({
      pnr: { value: 'TESTPNR', confidence: 'high' },
    });

    const parsed = parseRawLlmJson(rawJson, 'Short text');

    expect(parsed.pnr.value).toBe('TESTPNR');
    expect(parsed.pnr.confidence).toBe('high');

    expect(parsed.seats.value).toBeNull();
    expect(parsed.seats.confidence).toBe('low');

    expect(parsed.fare.value).toBeNull();
    expect(parsed.fare.confidence).toBe('low');

    expect(parsed.outboundDate.value).toBeNull();
    expect(parsed.roundEmdAmount.value).toBeNull();
  });

  it('sanitizes dirty numbers and date strings', () => {
    const rawJson = JSON.stringify({
      seats: { value: ' 50 seats ' },
      fare: { value: 'PKR 120,000.00' },
      outboundDate: { value: '2026-11-20T00:00:00.000Z' },
    });

    const parsed = parseRawLlmJson(rawJson, 'Dirty text');

    expect(parsed.seats.value).toBe(50);
    expect(parsed.fare.value).toBe(120000);
    expect(parsed.outboundDate.value).toBe('2026-11-20');
  });

  it('throws a helpful error on invalid JSON', () => {
    expect(() => parseRawLlmJson('not a json object', 'bad text')).toThrow(
      /Failed to parse LLM JSON output/
    );
  });
});
