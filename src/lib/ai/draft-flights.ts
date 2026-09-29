import type { FieldConfidence, ParsedBookingDraft } from './parse-booking';
import type { StopFormValues } from '@/lib/pnr-form-values';
import {
  citiesFromSector,
  isAirportCode,
  isFlightCode,
  isTime,
  isTripType,
  BAGGAGE_MAX_KG,
  BAGGAGE_MAX_PIECES,
  MAX_STOPS,
  normalizeAirportCode,
  normalizeFlightCode,
  type TripType,
} from '@/lib/flight-details';

export interface DraftFlightValues {
  tripType: TripType;
  outboundDepartureCity: string;
  outboundArrivalCity: string;
  outboundDepartureTime: string;
  outboundArrivalTime: string;
  outboundFlightCode: string;
  inboundDepartureCity: string;
  inboundArrivalCity: string;
  inboundDepartureTime: string;
  inboundArrivalTime: string;
  inboundFlightCode: string;
  outboundBaggagePieces: string;
  outboundBaggageKg: string;
  inboundBaggagePieces: string;
  inboundBaggageKg: string;
  outboundStops: StopFormValues[];
  inboundStops: StopFormValues[];
}

type Key = keyof DraftFlightValues;

/**
 * The flight fields of the review form, from an AI or spreadsheet draft.
 *
 * A value that is not in the form's format — a city name instead of a code, a
 * "9am" time — starts blank with low confidence rather than pre-filled, so the
 * form never offers something the save will refuse. Cities the model did not
 * return are read from the sector when it has one, at the sector's
 * confidence.
 */
export function draftFlightValues(draft: ParsedBookingDraft): {
  values: DraftFlightValues;
  /** No entry for the inbound fields of a one-way draft: they are not shown. */
  confidence: Partial<Record<Key, FieldConfidence>>;
} {
  const fromSector = citiesFromSector(draft.sector.value);

  const city = (key: Key & `${string}City`) => {
    const v = normalizeAirportCode(draft[key].value ?? '');
    if (isAirportCode(v)) return { value: v, confidence: draft[key].confidence };
    const s = fromSector?.[key];
    if (s) return { value: s, confidence: draft.sector.confidence };
    return { value: '', confidence: 'low' as const };
  };
  const time = (key: Key & `${string}Time`) => {
    const v = (draft[key].value ?? '').trim();
    return isTime(v) ? { value: v, confidence: draft[key].confidence } : { value: '', confidence: 'low' as const };
  };
  const code = (key: Key & `${string}FlightCode`) => {
    const v = normalizeFlightCode(draft[key].value ?? '');
    return isFlightCode(v) ? { value: v, confidence: draft[key].confidence } : { value: '', confidence: 'low' as const };
  };

  const count = (key: Key & `${string}Baggage${string}`, min: number, max: number) => {
    const v = draft[key].value;
    return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
      ? { value: String(v), confidence: draft[key].confidence }
      : { value: '', confidence: 'low' as const };
  };

  // Stops: only ones with a real airport code survive, and a code or time the
  // save would refuse starts blank — the same rule as every field above.
  const stopsOf = (key: 'outboundStops' | 'inboundStops') => {
    const list = (draft[key].value ?? [])
      .map((st) => {
        const city = normalizeAirportCode(st.city ?? '');
        const code = normalizeFlightCode(st.flightCode ?? '');
        const t = (v: string | null) => (v && isTime(v.trim()) ? v.trim() : '');
        return { city, flightCode: isFlightCode(code) ? code : '', arrivalTime: t(st.arrivalTime), departureTime: t(st.departureTime) };
      })
      .filter((st) => isAirportCode(st.city))
      .slice(0, MAX_STOPS);
    return { value: list, confidence: list.length ? draft[key].confidence : ('low' as const) };
  };

  // The model's answer first; then a return date means a return flight; then
  // a two-code sector means one way. Round trip is the form's default.
  const t = draft.tripType.value;
  const trip: { value: TripType; confidence: FieldConfidence } = isTripType(t)
    ? { value: t, confidence: draft.tripType.confidence }
    : draft.inboundDate.value
      ? { value: 'round_trip', confidence: 'medium' }
      : fromSector
        ? { value: fromSector.tripType, confidence: 'medium' }
        : { value: 'round_trip', confidence: 'low' };

  const fields = {
    outboundDepartureCity: city('outboundDepartureCity'),
    outboundArrivalCity: city('outboundArrivalCity'),
    outboundDepartureTime: time('outboundDepartureTime'),
    outboundArrivalTime: time('outboundArrivalTime'),
    outboundFlightCode: code('outboundFlightCode'),
    inboundDepartureCity: city('inboundDepartureCity'),
    inboundArrivalCity: city('inboundArrivalCity'),
    inboundDepartureTime: time('inboundDepartureTime'),
    inboundArrivalTime: time('inboundArrivalTime'),
    inboundFlightCode: code('inboundFlightCode'),
    outboundBaggagePieces: count('outboundBaggagePieces', 0, BAGGAGE_MAX_PIECES),
    outboundBaggageKg: count('outboundBaggageKg', 1, BAGGAGE_MAX_KG),
    inboundBaggagePieces: count('inboundBaggagePieces', 0, BAGGAGE_MAX_PIECES),
    inboundBaggageKg: count('inboundBaggageKg', 1, BAGGAGE_MAX_KG),
  };

  const outStops = stopsOf('outboundStops');
  const inStops = stopsOf('inboundStops');
  const oneWay = trip.value === 'one_way';
  const values = {
    tripType: trip.value,
    outboundStops: outStops.value,
    inboundStops: oneWay ? [] : inStops.value,
  } as DraftFlightValues;
  const confidence: Partial<Record<Key, FieldConfidence>> = { tripType: trip.confidence };
  // Rated only when something was found: an empty list is the direct-flight default, not a guess.
  if (outStops.value.length) confidence.outboundStops = outStops.confidence;
  if (!oneWay && inStops.value.length) confidence.inboundStops = inStops.confidence;
  for (const [k, f] of Object.entries(fields) as [Exclude<Key, 'tripType' | 'outboundStops' | 'inboundStops'>, { value: string; confidence: FieldConfidence }][]) {
    const hidden = trip.value === 'one_way' && k.startsWith('inbound');
    values[k] = hidden ? '' : f.value;
    if (!hidden) confidence[k] = f.confidence;
  }
  return { values, confidence };
}
