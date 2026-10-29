import { describe, expect, it } from 'vitest';
import { draftFlightValues } from './draft-flights';
import { parseRawLlmJson } from './parse-booking';

function draft(fields: Record<string, unknown>) {
  return parseRawLlmJson(JSON.stringify(fields), 'text')[0];
}

describe('draftFlightValues', () => {
  it('takes the model’s flights, normalised', () => {
    const { values, confidence } = draftFlightValues(
      draft({
        tripType: { value: 'round_trip', confidence: 'high' },
        outboundDepartureCity: { value: 'isb', confidence: 'high' },
        outboundArrivalCity: { value: 'JED', confidence: 'high' },
        outboundDepartureTime: { value: '08:30', confidence: 'high' },
        outboundFlightCode: { value: 'sv 727', confidence: 'medium' },
        inboundDepartureCity: { value: 'MED', confidence: 'high' },
        inboundArrivalCity: { value: 'ISB', confidence: 'high' },
        inboundDepartureTime: { value: '14:05', confidence: 'high' },
        inboundFlightCode: { value: 'SV726', confidence: 'high' },
        outboundBaggagePieces: { value: 2, confidence: 'high' },
        outboundBaggageKg: { value: '23', confidence: 'high' },
        inboundBaggageKg: { value: 30, confidence: 'medium' },
      })
    );
    expect(values).toEqual({
      tripType: 'round_trip',
      outboundDepartureCity: 'ISB',
      outboundArrivalCity: 'JED',
      outboundDepartureTime: '08:30',
      outboundArrivalTime: '',
      outboundArrivalDate: '',
      outboundFlightCode: 'SV727',
      inboundDepartureCity: 'MED',
      inboundArrivalCity: 'ISB',
      inboundDepartureTime: '14:05',
      inboundArrivalTime: '',
      inboundArrivalDate: '',
      inboundFlightCode: 'SV726',
      outboundBaggagePieces: '2',
      outboundBaggageKg: '23',
      inboundBaggagePieces: '',
      inboundBaggageKg: '30',
      outboundStops: [],
      inboundStops: [],
    });
    expect(confidence.inboundBaggageKg).toBe('medium');
    expect(confidence.inboundBaggagePieces).toBe('low');
    expect(confidence.outboundFlightCode).toBe('medium');
    expect(confidence.outboundArrivalTime).toBe('low');
  });

  it('drops a baggage figure the save would refuse', () => {
    const { values } = draftFlightValues(
      draft({
        outboundBaggagePieces: { value: 1.5, confidence: 'high' },
        outboundBaggageKg: { value: 250, confidence: 'high' },
      })
    );
    expect(values.outboundBaggagePieces).toBe('');
    expect(values.outboundBaggageKg).toBe('');
  });

  it('never pre-fills a value the save would refuse', () => {
    const { values, confidence } = draftFlightValues(
      draft({
        tripType: { value: 'one_way', confidence: 'high' },
        outboundDepartureCity: { value: 'Islamabad', confidence: 'high' },
        outboundDepartureTime: { value: '9am', confidence: 'high' },
        outboundFlightCode: { value: 'Saudia', confidence: 'high' },
      })
    );
    expect(values.outboundDepartureCity).toBe('');
    expect(values.outboundDepartureTime).toBe('');
    expect(values.outboundFlightCode).toBe('');
    expect(confidence.outboundDepartureCity).toBe('low');
    // One way: the inbound fields are not on the form, so they carry no rating
    // to count against the draft.
    expect(confidence.inboundFlightCode).toBeUndefined();
    expect(values.inboundFlightCode).toBe('');
  });

  it('reads missing cities from the sector, at the sector’s confidence', () => {
    const { values, confidence } = draftFlightValues(
      draft({
        sector: { value: 'ISB-JED-MED-ISB', confidence: 'medium' },
        inboundDate: { value: '2026-12-01', confidence: 'high' },
        outboundDepartureCity: { value: 'LHE', confidence: 'high' },
      })
    );
    expect(values.tripType).toBe('round_trip');
    // The model's own answer wins over the sector.
    expect(values.outboundDepartureCity).toBe('LHE');
    expect(confidence.outboundDepartureCity).toBe('high');
    expect(values.outboundArrivalCity).toBe('JED');
    expect(values.inboundDepartureCity).toBe('MED');
    expect(values.inboundArrivalCity).toBe('ISB');
    expect(confidence.inboundArrivalCity).toBe('medium');
  });

  it('works out the trip type when the model gives none', () => {
    expect(draftFlightValues(draft({ inboundDate: { value: '2026-12-01' } })).values.tripType).toBe('round_trip');
    expect(draftFlightValues(draft({ sector: { value: 'ISB-JED' } })).values.tripType).toBe('one_way');
    const blank = draftFlightValues(draft({}));
    expect(blank.values.tripType).toBe('round_trip');
    expect(blank.confidence.tripType).toBe('low');
  });
});

describe('draftFlightValues — stops', () => {
  it('keeps real stops in order, blanking what the save would refuse', () => {
    const { values, confidence } = draftFlightValues(
      draft({
        tripType: { value: 'round_trip', confidence: 'high' },
        outboundStops: {
          value: [
            { city: 'dxb', flightCode: 'ek 612', arrivalTime: '10:05', departureTime: '13:40' },
            { city: 'Dubai', flightCode: null, arrivalTime: null, departureTime: null },
            { city: 'RUH', flightCode: 'Saudia', arrivalTime: '9am', departureTime: null },
          ],
          confidence: 'medium',
        },
        inboundStops: { value: [], confidence: 'high' },
      })
    );
    expect(values.outboundStops).toEqual([
      { city: 'DXB', flightCode: 'EK612', arrivalTime: '10:05', departureTime: '13:40', arrivalDate: '', departureDate: '' },
      { city: 'RUH', flightCode: '', arrivalTime: '', departureTime: '', arrivalDate: '', departureDate: '' },
    ]);
    expect(confidence.outboundStops).toBe('medium');
    expect(values.inboundStops).toEqual([]);
    expect(confidence.inboundStops).toBeUndefined();
  });

  it('a one-way draft carries no inbound stops', () => {
    const { values } = draftFlightValues(
      draft({
        tripType: { value: 'one_way', confidence: 'high' },
        inboundStops: { value: [{ city: 'DXB', flightCode: null, arrivalTime: null, departureTime: null }], confidence: 'high' },
      })
    );
    expect(values.inboundStops).toEqual([]);
  });
});

describe('draftFlightValues — arrival dates (Phase 9 Step 1)', () => {
  it('keeps a real arrival date, and blanks anything else at low confidence', () => {
    const { values, confidence } = draftFlightValues(
      draft({
        tripType: { value: 'round_trip', confidence: 'high' },
        outboundDate: { value: '2026-06-30', confidence: 'high' },
        inboundDate: { value: '2026-07-20', confidence: 'high' },
        outboundArrivalDate: { value: '2026-07-01', confidence: 'medium' },
        // The parser reads "+1" as 2000-12-31: before the flight, so dropped.
        inboundArrivalDate: { value: '+1', confidence: 'high' },
        outboundStops: {
          value: [{ city: 'DXB', flightCode: null, arrivalTime: '01:00', departureTime: '03:00', arrivalDate: '2026-07-01', departureDate: 'next day' }],
          confidence: 'high',
        },
      })
    );
    expect(values.outboundArrivalDate).toBe('2026-07-01');
    expect(confidence.outboundArrivalDate).toBe('medium');
    expect(values.inboundArrivalDate).toBe('');
    expect(confidence.inboundArrivalDate).toBe('low');
    expect(values.outboundStops[0]).toMatchObject({ arrivalDate: '2026-07-01', departureDate: '' });
  });
});
