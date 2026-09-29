/**
 * The flights on a booking: one leg for a one-way trip, outbound and inbound
 * for a round trip (owner request, 2026-09-26).
 *
 * The outbound departure date IS `pnrs.outbound_date` and the inbound departure
 * date IS `pnrs.inbound_date` — the same fields the EMD policy, ticketing
 * deadline and emails already read — and `pnrs.sector` is built from the
 * cities rather than typed, so nothing downstream had to learn a new field.
 *
 * Shared by the booking form (client) and the create/edit actions (server), so
 * the rules the browser shows are the rules the server enforces.
 */

export const TRIP_TYPES = ['one_way', 'round_trip'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  one_way: 'One way',
  round_trip: 'Round trip',
};

export function isTripType(v: unknown): v is TripType {
  return typeof v === 'string' && (TRIP_TYPES as readonly string[]).includes(v);
}

export interface FlightLeg {
  /** YYYY-MM-DD */
  date: string;
  /** 3-letter airport code, uppercase */
  departureCity: string;
  arrivalCity: string;
  /** HH:MM (24h), or null when not entered */
  departureTime: string | null;
  arrivalTime: string | null;
  /** e.g. SV727 — uppercase, no spaces */
  flightCode: string;
  /** Checked bags each passenger may carry on this flight, or null. */
  baggagePieces: number | null;
  /** Weight limit per bag in kg, or null. */
  baggageKg: number | null;
  /** Stops on a connecting flight, in order. Empty for a direct flight. */
  stops: FlightStop[];
}

/**
 * A stop on a connecting flight (owner, 2026-09-28). `flightCode` is the
 * ONWARD flight from the stop — the aircraft may change there — and is null
 * when the same flight continues. Times are local, both optional.
 */
export interface FlightStop {
  city: string;
  flightCode: string | null;
  arrivalTime: string | null;
  departureTime: string | null;
}

/** Most stops one flight may have; the database enforces the same. */
export const MAX_STOPS = 3;

/** Bounds match the database checks on `pnrs.*_baggage_*`. */
export const BAGGAGE_MAX_PIECES = 10;
export const BAGGAGE_MAX_KG = 100;

/** "2 × 23 kg", "2 bags", "23 kg", or null when nothing is recorded. */
export function formatBaggage(pieces: number | null, kg: number | null): string | null {
  if (pieces === null && kg === null) return null;
  if (pieces !== null && kg !== null) return `${pieces} × ${kg} kg`;
  if (pieces !== null) return `${pieces} bag${pieces === 1 ? '' : 's'}`;
  return `${kg} kg`;
}

function wholeNumber(v: string | null): number | null | 'invalid' {
  if (v === null) return null;
  return /^\d+$/.test(v) ? Number(v) : 'invalid';
}

export interface FlightDetails {
  tripType: TripType;
  outbound: FlightLeg;
  /** Null for a one-way trip. */
  inbound: FlightLeg | null;
  /** Built from the cities, e.g. ISB-JED-MED-ISB. */
  sector: string;
}

/** Uppercased and trimmed; validity is a separate question. */
export function normalizeAirportCode(v: string): string {
  return v.trim().toUpperCase();
}

export function isAirportCode(v: string): boolean {
  return /^[A-Z]{3}$/.test(v);
}

/** `sv 727` → `SV727`. */
export function normalizeFlightCode(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

/**
 * An airline designator — two characters (IATA: `SV`, `9P`, `PK`) or three
 * letters (ICAO: `SVA`) — then a 1–4 digit flight number and an optional
 * operational suffix letter.
 */
export function isFlightCode(v: string): boolean {
  return /^([A-Z]{2,3}|[A-Z]\d|\d[A-Z])\d{1,4}[A-Z]?$/.test(v);
}

/** 24-hour `HH:MM`, as `<input type="time">` posts it. */
export function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * The sector string every existing screen and email shows.
 *
 * One way: `ISB-JED`. Round trip: the outbound pair, then the inbound pair,
 * with the inbound departure dropped when it is where the outbound landed —
 * so ISB→JED, JED→ISB is `ISB-JED-ISB` and the open-jaw ISB→JED, MED→ISB is
 * `ISB-JED-MED-ISB`, matching how the sheet wrote them.
 */
type SectorLeg = Pick<FlightLeg, 'departureCity' | 'arrivalCity'> & { stops?: Pick<FlightStop, 'city'>[] };

export function buildSector(outbound: SectorLeg, inbound: SectorLeg | null): string {
  // Stops are part of the route (owner, 2026-09-28): ISB→DXB→JED is ISB-DXB-JED.
  const parts = [outbound.departureCity, ...(outbound.stops ?? []).map((s) => s.city), outbound.arrivalCity];
  if (inbound) {
    if (inbound.departureCity !== outbound.arrivalCity) parts.push(inbound.departureCity);
    parts.push(...(inbound.stops ?? []).map((s) => s.city), inbound.arrivalCity);
  }
  return parts.join('-');
}

export interface SectorCities {
  tripType: TripType;
  outboundDepartureCity: string;
  outboundArrivalCity: string;
  inboundDepartureCity: string;
  inboundArrivalCity: string;
}

/**
 * The reverse of `buildSector`, for bookings saved before the cities were
 * their own fields (and for an AI draft that found a sector but no cities).
 * Only the shapes `buildSector` produces are read — two, three or four
 * airport codes. Anything else returns null and the fields start blank, which
 * is better than a guess staff might not notice.
 */
export function citiesFromSector(sector: string | null | undefined): SectorCities | null {
  if (!sector) return null;
  const codes = sector.split('-').map(normalizeAirportCode);
  if (!codes.every(isAirportCode)) return null;
  if (codes.length === 2) {
    return {
      tripType: 'one_way',
      outboundDepartureCity: codes[0],
      outboundArrivalCity: codes[1],
      inboundDepartureCity: '',
      inboundArrivalCity: '',
    };
  }
  if (codes.length === 3) {
    return {
      tripType: 'round_trip',
      outboundDepartureCity: codes[0],
      outboundArrivalCity: codes[1],
      inboundDepartureCity: codes[1],
      inboundArrivalCity: codes[2],
    };
  }
  if (codes.length === 4) {
    return {
      tripType: 'round_trip',
      outboundDepartureCity: codes[0],
      outboundArrivalCity: codes[1],
      inboundDepartureCity: codes[2],
      inboundArrivalCity: codes[3],
    };
  }
  return null;
}

type Read = (key: string) => string | null;

function readLeg(
  read: Read,
  prefix: 'outbound' | 'inbound',
  label: string
): { leg: FlightLeg } | { error: string } {
  const date = read(`${prefix}_date`);
  const departureCity = normalizeAirportCode(read(`${prefix}_departure_city`) ?? '');
  const arrivalCity = normalizeAirportCode(read(`${prefix}_arrival_city`) ?? '');
  const departureTime = read(`${prefix}_departure_time`);
  const arrivalTime = read(`${prefix}_arrival_time`);
  const flightCode = normalizeFlightCode(read(`${prefix}_flight_code`) ?? '');
  const baggagePieces = wholeNumber(read(`${prefix}_baggage_pieces`));
  const baggageKg = wholeNumber(read(`${prefix}_baggage_kg`));

  if (!date) return { error: `${label}: departure date is required.` };
  if (!isIsoDate(date)) return { error: `${label}: departure date is not a valid date.` };
  if (!departureCity) return { error: `${label}: departure city is required.` };
  if (!isAirportCode(departureCity)) {
    return { error: `${label}: departure city must be a 3-letter airport code, e.g. ISB.` };
  }
  if (!arrivalCity) return { error: `${label}: arrival city is required.` };
  if (!isAirportCode(arrivalCity)) {
    return { error: `${label}: arrival city must be a 3-letter airport code, e.g. JED.` };
  }
  if (departureCity === arrivalCity) {
    return { error: `${label}: departure and arrival city cannot both be ${departureCity}.` };
  }
  if (departureTime && !isTime(departureTime)) {
    return { error: `${label}: departure time must be HH:MM.` };
  }
  if (arrivalTime && !isTime(arrivalTime)) {
    return { error: `${label}: arrival time must be HH:MM.` };
  }
  if (!flightCode) return { error: `${label}: flight code is required.` };
  if (!isFlightCode(flightCode)) {
    return { error: `${label}: flight code "${flightCode}" is not a flight number, e.g. SV727.` };
  }

  // Baggage is optional, and either half may be given alone: some airlines
  // state only a piece count, others only a weight.
  if (baggagePieces === 'invalid' || (baggagePieces !== null && baggagePieces > BAGGAGE_MAX_PIECES)) {
    return { error: `${label}: bags must be a whole number from 0 to ${BAGGAGE_MAX_PIECES}.` };
  }
  if (baggageKg === 'invalid' || (baggageKg !== null && (baggageKg < 1 || baggageKg > BAGGAGE_MAX_KG))) {
    return { error: `${label}: weight must be a whole number of kg from 1 to ${BAGGAGE_MAX_KG}.` };
  }

  const stops = readStops(read, prefix, label, departureCity, arrivalCity);
  if ('error' in stops) return stops;

  return {
    leg: {
      date, departureCity, arrivalCity, departureTime, arrivalTime, flightCode, baggagePieces, baggageKg,
      stops: stops.stops,
    },
  };
}

/**
 * The stops of one flight, posted as `<leg>_stop_count` and
 * `<leg>_stop_<i>_city|flight_code|arrival_time|departure_time`.
 */
function readStops(
  read: Read,
  prefix: 'outbound' | 'inbound',
  label: string,
  from: string,
  to: string
): { stops: FlightStop[] } | { error: string } {
  const count = Number(read(`${prefix}_stop_count`) ?? '0');
  if (!Number.isInteger(count) || count < 0 || count > MAX_STOPS) {
    return { error: `${label}: a flight can have at most ${MAX_STOPS} stops.` };
  }
  const stops: FlightStop[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const city = normalizeAirportCode(read(`${prefix}_stop_${i}_city`) ?? '');
    const code = normalizeFlightCode(read(`${prefix}_stop_${i}_flight_code`) ?? '');
    const arrivalTime = read(`${prefix}_stop_${i}_arrival_time`);
    const departureTime = read(`${prefix}_stop_${i}_departure_time`);
    if (!city) return { error: `${label}: stop ${n} needs a city.` };
    if (!isAirportCode(city)) return { error: `${label}: stop ${n} city must be a 3-letter airport code, e.g. DXB.` };
    const before = i === 0 ? from : stops[i - 1].city;
    if (city === before) return { error: `${label}: stop ${n} (${city}) is the same as the city before it.` };
    if (code && !isFlightCode(code)) {
      return { error: `${label}: stop ${n} flight code "${code}" is not a flight number, e.g. EK612.` };
    }
    if (arrivalTime && !isTime(arrivalTime)) return { error: `${label}: stop ${n} arrival time must be HH:MM.` };
    if (departureTime && !isTime(departureTime)) return { error: `${label}: stop ${n} departure time must be HH:MM.` };
    stops.push({ city, flightCode: code || null, arrivalTime, departureTime });
  }
  if (stops.length > 0 && stops[stops.length - 1].city === to) {
    return { error: `${label}: the last stop cannot be the arrival city ${to}.` };
  }
  return { stops };
}

/**
 * Reads and validates the flight fields of the booking form. The first
 * problem found is returned, named by the section it is in, like every other
 * booking validation.
 *
 * Required, as the owner specified: date, both cities and the flight code on
 * every leg. Every time is optional (owner, 2026-09-26).
 */
export function readFlightDetails(read: Read): { details: FlightDetails } | { error: string } {
  const tripType = read('trip_type');
  if (!isTripType(tripType)) return { error: 'Choose one way or round trip.' };

  const outbound = readLeg(read, 'outbound', tripType === 'one_way' ? 'Flight details' : 'Outbound');
  if ('error' in outbound) return outbound;

  if (tripType === 'one_way') {
    return {
      details: {
        tripType,
        outbound: outbound.leg,
        inbound: null,
        sector: buildSector(outbound.leg, null),
      },
    };
  }

  const inbound = readLeg(read, 'inbound', 'Inbound');
  if ('error' in inbound) return inbound;

  if (inbound.leg.date < outbound.leg.date) {
    return { error: 'Inbound: departure date cannot be before the outbound departure date.' };
  }

  return {
    details: {
      tripType,
      outbound: outbound.leg,
      inbound: inbound.leg,
      sector: buildSector(outbound.leg, inbound.leg),
    },
  };
}

/** The `flight_stops` rows a validated set of flight details writes. */
export function flightStopRows(d: FlightDetails) {
  const legs: ['outbound' | 'inbound', FlightLeg | null][] = [['outbound', d.outbound], ['inbound', d.inbound]];
  return legs.flatMap(([leg, l]) =>
    (l?.stops ?? []).map((s, i) => ({
      leg,
      position: i + 1,
      city: s.city,
      flightCode: s.flightCode,
      arrivalTime: timeToDb(s.arrivalTime),
      departureTime: timeToDb(s.departureTime),
    }))
  );
}

/** "DXB (EK612)" / "none" — how a leg's stops read in the change history. */
export function describeStops(stops: Pick<FlightStop, 'city' | 'flightCode' | 'arrivalTime' | 'departureTime'>[]): string {
  if (stops.length === 0) return 'none';
  return stops
    .map((s) => {
      const times = s.arrivalTime || s.departureTime ? ` ${s.arrivalTime ?? '?'}–${s.departureTime ?? '?'}` : '';
      return `${s.city}${times}${s.flightCode ? ` (${s.flightCode})` : ''}`;
    })
    .join(', ');
}

/** A stored `time` column's value — Prisma hands it back on 1970-01-01 UTC. */
function timeToDb(t: string | null): Date | null {
  return t ? new Date(`1970-01-01T${t}:00.000Z`) : null;
}

function dateToDb(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

/**
 * The `pnrs` columns a validated set of flight details writes. A one-way trip
 * clears every inbound column, so switching a booking from round trip to one
 * way cannot leave a return flight behind.
 */
export function flightColumns(d: FlightDetails) {
  return {
    tripType: d.tripType,
    sector: d.sector,
    outboundDate: dateToDb(d.outbound.date),
    outboundDepartureCity: d.outbound.departureCity,
    outboundArrivalCity: d.outbound.arrivalCity,
    outboundDepartureTime: timeToDb(d.outbound.departureTime),
    outboundArrivalTime: timeToDb(d.outbound.arrivalTime),
    outboundFlightCode: d.outbound.flightCode,
    outboundBaggagePieces: d.outbound.baggagePieces,
    outboundBaggageKg: d.outbound.baggageKg,
    inboundDate: d.inbound ? dateToDb(d.inbound.date) : null,
    inboundDepartureCity: d.inbound?.departureCity ?? null,
    inboundArrivalCity: d.inbound?.arrivalCity ?? null,
    inboundDepartureTime: timeToDb(d.inbound?.departureTime ?? null),
    inboundArrivalTime: timeToDb(d.inbound?.arrivalTime ?? null),
    inboundFlightCode: d.inbound?.flightCode ?? null,
    inboundBaggagePieces: d.inbound?.baggagePieces ?? null,
    inboundBaggageKg: d.inbound?.baggageKg ?? null,
  };
}

/** The `pnrs` columns stored as `time`, whose values must print as HH:MM, not as a date. */
export const FLIGHT_TIME_COLUMNS = new Set([
  'outboundDepartureTime',
  'outboundArrivalTime',
  'inboundDepartureTime',
  'inboundArrivalTime',
]);

/** A `time` column as HH:MM, or null. */
export function timeFromDb(t: Date | null | undefined): string | null {
  return t ? t.toISOString().slice(11, 16) : null;
}
