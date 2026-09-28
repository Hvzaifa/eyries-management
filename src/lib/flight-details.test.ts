import { describe, expect, it } from 'vitest';
import {
  buildSector,
  citiesFromSector,
  flightColumns,
  formatBaggage,
  isFlightCode,
  normalizeFlightCode,
  readFlightDetails,
  timeFromDb,
} from './flight-details';

function reader(fields: Record<string, string>) {
  return (key: string) => {
    const v = fields[key];
    return v === undefined || v.trim() === '' ? null : v.trim();
  };
}

const OUTBOUND = {
  outbound_date: '2026-11-15',
  outbound_departure_city: 'isb',
  outbound_arrival_city: 'jed',
  outbound_departure_time: '08:30',
  outbound_arrival_time: '11:45',
  outbound_flight_code: 'sv 727',
};

const INBOUND = {
  inbound_date: '2026-12-01',
  inbound_departure_city: 'MED',
  inbound_arrival_city: 'ISB',
  inbound_departure_time: '14:00',
  inbound_arrival_time: '',
  inbound_flight_code: 'SV726',
};

describe('baggage', () => {
  it('is optional, per leg, and either half may stand alone', () => {
    const r = readFlightDetails(
      reader({
        ...OUTBOUND,
        ...INBOUND,
        outbound_baggage_pieces: '2',
        outbound_baggage_kg: '23',
        inbound_baggage_kg: '30',
        trip_type: 'round_trip',
      })
    );
    if (!('details' in r)) throw new Error(r.error);
    expect([r.details.outbound.baggagePieces, r.details.outbound.baggageKg]).toEqual([2, 23]);
    expect([r.details.inbound?.baggagePieces, r.details.inbound?.baggageKg]).toEqual([null, 30]);
    expect(flightColumns(r.details)).toMatchObject({
      outboundBaggagePieces: 2,
      outboundBaggageKg: 23,
      inboundBaggagePieces: null,
      inboundBaggageKg: 30,
    });
  });

  it('zero bags is a real answer (no checked baggage)', () => {
    const r = readFlightDetails(reader({ ...OUTBOUND, outbound_baggage_pieces: '0', trip_type: 'one_way' }));
    if (!('details' in r)) throw new Error(r.error);
    expect(r.details.outbound.baggagePieces).toBe(0);
  });

  it.each([
    ['outbound_baggage_pieces', '1.5', 'Flight details: bags must be a whole number from 0 to 10.'],
    ['outbound_baggage_pieces', '-1', 'Flight details: bags must be a whole number from 0 to 10.'],
    ['outbound_baggage_pieces', '11', 'Flight details: bags must be a whole number from 0 to 10.'],
    ['outbound_baggage_kg', '0', 'Flight details: weight must be a whole number of kg from 1 to 100.'],
    ['outbound_baggage_kg', '23kg', 'Flight details: weight must be a whole number of kg from 1 to 100.'],
    ['outbound_baggage_kg', '101', 'Flight details: weight must be a whole number of kg from 1 to 100.'],
  ])('refuses %s = %j', (key, value, error) => {
    expect(readFlightDetails(reader({ ...OUTBOUND, [key]: value, trip_type: 'one_way' }))).toEqual({ error });
  });

  it('a one-way trip stores no inbound baggage', () => {
    const r = readFlightDetails(
      reader({ ...OUTBOUND, ...INBOUND, inbound_baggage_pieces: '2', inbound_baggage_kg: '23', trip_type: 'one_way' })
    );
    if (!('details' in r)) throw new Error(r.error);
    expect(flightColumns(r.details)).toMatchObject({ inboundBaggagePieces: null, inboundBaggageKg: null });
  });

  it('formats for display', () => {
    expect(formatBaggage(2, 23)).toBe('2 × 23 kg');
    expect(formatBaggage(1, null)).toBe('1 bag');
    expect(formatBaggage(null, 30)).toBe('30 kg');
    expect(formatBaggage(0, null)).toBe('0 bags');
    expect(formatBaggage(null, null)).toBeNull();
  });
});

describe('buildSector', () => {
  it('one way is the pair', () => {
    expect(buildSector({ departureCity: 'ISB', arrivalCity: 'JED' }, null)).toBe('ISB-JED');
  });

  it('a return to the same airport is written once', () => {
    expect(
      buildSector({ departureCity: 'ISB', arrivalCity: 'JED' }, { departureCity: 'JED', arrivalCity: 'ISB' })
    ).toBe('ISB-JED-ISB');
  });

  it('an open jaw keeps all four', () => {
    expect(
      buildSector({ departureCity: 'ISB', arrivalCity: 'JED' }, { departureCity: 'MED', arrivalCity: 'ISB' })
    ).toBe('ISB-JED-MED-ISB');
  });
});

describe('citiesFromSector', () => {
  it('reads back every shape buildSector writes', () => {
    for (const sector of ['ISB-JED', 'ISB-JED-ISB', 'ISB-JED-MED-ISB', 'KHI-JED-LHE']) {
      const c = citiesFromSector(sector)!;
      const inbound =
        c.tripType === 'round_trip'
          ? { departureCity: c.inboundDepartureCity, arrivalCity: c.inboundArrivalCity }
          : null;
      expect(
        buildSector({ departureCity: c.outboundDepartureCity, arrivalCity: c.outboundArrivalCity }, inbound)
      ).toBe(sector);
    }
  });

  it('two codes are one way', () => {
    expect(citiesFromSector('isb-jed')).toMatchObject({
      tripType: 'one_way',
      outboundDepartureCity: 'ISB',
      outboundArrivalCity: 'JED',
    });
  });

  it('anything it cannot read starts blank rather than guessed', () => {
    expect(citiesFromSector(null)).toBeNull();
    expect(citiesFromSector('')).toBeNull();
    expect(citiesFromSector('ISB/JED')).toBeNull();
    expect(citiesFromSector('Islamabad-Jeddah')).toBeNull();
    expect(citiesFromSector('ISB-JED-MED-RUH-ISB')).toBeNull();
    expect(citiesFromSector('ISB')).toBeNull();
  });
});

describe('flight codes', () => {
  it('normalises spacing and case', () => {
    expect(normalizeFlightCode(' sv 727 ')).toBe('SV727');
  });

  it.each(['SV727', 'PK303', '9P842', 'G9123', 'SVA727', 'PA2', 'ER1234', 'SV727A'])('accepts %s', (c) => {
    expect(isFlightCode(c)).toBe(true);
  });

  it.each(['SV', '727', 'SV12345', '12345', 'SV-727', 'SVAB727'])('rejects %s', (c) => {
    expect(isFlightCode(c)).toBe(false);
  });
});

describe('readFlightDetails', () => {
  it('requires a trip type', () => {
    expect(readFlightDetails(reader(OUTBOUND))).toEqual({ error: 'Choose one way or round trip.' });
    expect(readFlightDetails(reader({ ...OUTBOUND, trip_type: 'multi_city' }))).toEqual({
      error: 'Choose one way or round trip.',
    });
  });

  it('one way reads the outbound leg only, normalised', () => {
    const r = readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, trip_type: 'one_way' }));
    expect(r).toEqual({
      details: {
        tripType: 'one_way',
        outbound: {
          date: '2026-11-15',
          departureCity: 'ISB',
          arrivalCity: 'JED',
          departureTime: '08:30',
          arrivalTime: '11:45',
          flightCode: 'SV727',
          baggagePieces: null,
          baggageKg: null,
        },
        inbound: null,
        sector: 'ISB-JED',
      },
    });
  });

  it('round trip reads both legs and builds the sector', () => {
    const r = readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, trip_type: 'round_trip' }));
    if (!('details' in r)) throw new Error(r.error);
    expect(r.details.inbound).toEqual({
      date: '2026-12-01',
      departureCity: 'MED',
      arrivalCity: 'ISB',
      departureTime: '14:00',
      arrivalTime: null,
      flightCode: 'SV726',
      baggagePieces: null,
      baggageKg: null,
    });
    expect(r.details.sector).toBe('ISB-JED-MED-ISB');
  });

  it('outbound times are optional', () => {
    const r = readFlightDetails(
      reader({ ...OUTBOUND, outbound_departure_time: '', outbound_arrival_time: '', trip_type: 'one_way' })
    );
    if (!('details' in r)) throw new Error(r.error);
    expect(r.details.outbound.departureTime).toBeNull();
    expect(r.details.outbound.arrivalTime).toBeNull();
  });

  it('no time is required on either leg', () => {
    const r = readFlightDetails(
      reader({
        ...OUTBOUND,
        ...INBOUND,
        outbound_departure_time: '',
        outbound_arrival_time: '',
        inbound_departure_time: '',
        inbound_arrival_time: '',
        trip_type: 'round_trip',
      })
    );
    if (!('details' in r)) throw new Error(r.error);
    expect(r.details.outbound.departureTime).toBeNull();
    expect(r.details.inbound?.departureTime).toBeNull();
    expect(r.details.inbound?.arrivalTime).toBeNull();
  });

  it.each([
    ['outbound_date', '', 'Flight details: departure date is required.'],
    ['outbound_date', '2026-02-30', 'Flight details: departure date is not a valid date.'],
    ['outbound_departure_city', '', 'Flight details: departure city is required.'],
    ['outbound_departure_city', 'Islamabad', 'Flight details: departure city must be a 3-letter airport code, e.g. ISB.'],
    ['outbound_arrival_city', '', 'Flight details: arrival city is required.'],
    ['outbound_arrival_city', 'isb', 'Flight details: departure and arrival city cannot both be ISB.'],
    ['outbound_departure_time', '25:00', 'Flight details: departure time must be HH:MM.'],
    ['outbound_arrival_time', '9am', 'Flight details: arrival time must be HH:MM.'],
    ['outbound_flight_code', '', 'Flight details: flight code is required.'],
    ['outbound_flight_code', 'Saudia', 'Flight details: flight code "SAUDIA" is not a flight number, e.g. SV727.'],
  ])('one way: bad %s (%j) is refused', (key, value, error) => {
    expect(readFlightDetails(reader({ ...OUTBOUND, [key]: value, trip_type: 'one_way' }))).toEqual({ error });
  });

  it('names the section on a round trip', () => {
    expect(
      readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, outbound_flight_code: '', trip_type: 'round_trip' }))
    ).toEqual({ error: 'Outbound: flight code is required.' });
    expect(
      readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, inbound_arrival_city: '', trip_type: 'round_trip' }))
    ).toEqual({ error: 'Inbound: arrival city is required.' });
  });

  it('a return cannot leave before the outbound flight', () => {
    expect(
      readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, inbound_date: '2026-11-14', trip_type: 'round_trip' }))
    ).toEqual({ error: 'Inbound: departure date cannot be before the outbound departure date.' });
    // Same day is allowed — a day trip is a real itinerary.
    const sameDay = readFlightDetails(
      reader({ ...OUTBOUND, ...INBOUND, inbound_date: '2026-11-15', trip_type: 'round_trip' })
    );
    expect('details' in sameDay).toBe(true);
  });

  it('one way does not check the inbound fields at all', () => {
    const r = readFlightDetails(
      reader({ ...OUTBOUND, inbound_date: 'garbage', inbound_flight_code: 'nope', trip_type: 'one_way' })
    );
    expect('details' in r).toBe(true);
  });
});

describe('flightColumns', () => {
  it('writes dates and times the way the existing columns are stored, and they read back', () => {
    const r = readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, trip_type: 'round_trip' }));
    if (!('details' in r)) throw new Error(r.error);
    const cols = flightColumns(r.details);
    expect(cols.outboundDate.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(cols.inboundDate?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(timeFromDb(cols.outboundDepartureTime)).toBe('08:30');
    expect(timeFromDb(cols.outboundArrivalTime)).toBe('11:45');
    expect(timeFromDb(cols.inboundDepartureTime)).toBe('14:00');
    expect(cols.inboundArrivalTime).toBeNull();
    expect(cols.sector).toBe('ISB-JED-MED-ISB');
  });

  it('one way clears every inbound column', () => {
    const r = readFlightDetails(reader({ ...OUTBOUND, ...INBOUND, trip_type: 'one_way' }));
    if (!('details' in r)) throw new Error(r.error);
    const cols = flightColumns(r.details);
    expect(cols).toMatchObject({
      tripType: 'one_way',
      inboundDate: null,
      inboundDepartureCity: null,
      inboundArrivalCity: null,
      inboundDepartureTime: null,
      inboundArrivalTime: null,
      inboundFlightCode: null,
    });
  });
});
