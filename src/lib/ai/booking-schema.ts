/**
 * The fields the AI drafts, defined once (2026-10-05), as the compact list the
 * prompt carries.
 *
 * The reply is a TABLE — field names once, one row of values per booking —
 * because the size of the reply is what decides the time taken. Measured on
 * the owner's screenshot of 14 bookings: a value-and-confidence object per
 * field ran past 25 s and was cut off; plain objects took 23 s (2,800 tokens);
 * the table took 10–14 s (1,800 tokens), every value right. Field names were
 * most of the reply once there was more than one booking.
 *
 * Nothing the model returns is trusted: `parseRawLlmJson` re-checks every value.
 */

type Kind = 'string' | 'number' | 'date' | 'time' | 'boolean' | 'stops' | 'tripType';

export const BOOKING_FIELDS: { key: string; kind: Kind; hint?: string }[] = [
  { key: 'pnr', kind: 'string', hint: 'airline booking reference' },
  { key: 'gdsPnr', kind: 'string', hint: 'GDS record locator if different' },
  { key: 'airlineCode', kind: 'string', hint: '2-character IATA code' },
  { key: 'investorCompany', kind: 'string', hint: 'group / agency name' },
  { key: 'licenseName', kind: 'string' },
  { key: 'branchName', kind: 'string' },
  { key: 'segment', kind: 'string', hint: 'Umrah, Employment or Tour' },
  { key: 'seats', kind: 'number', hint: 'passengers / seats' },
  { key: 'sector', kind: 'string', hint: 'e.g. ISB-JED-ISB' },
  { key: 'requestDate', kind: 'date' },
  { key: 'outboundDate', kind: 'date', hint: 'first flight departure' },
  { key: 'inboundDate', kind: 'date', hint: 'return flight departure' },
  { key: 'pnrTlDate', kind: 'date', hint: 'booking time limit' },
  { key: 'fare', kind: 'number', hint: 'per passenger, without taxes' },
  { key: 'airlineTaxes', kind: 'number', hint: 'per passenger' },
  { key: 'psf', kind: 'number' },
  { key: 'tripType', kind: 'tripType' },
  { key: 'outboundDepartureCity', kind: 'string', hint: '3-letter code' },
  { key: 'outboundArrivalCity', kind: 'string', hint: '3-letter code' },
  { key: 'outboundDepartureTime', kind: 'time' },
  { key: 'outboundArrivalTime', kind: 'time' },
  { key: 'outboundFlightCode', kind: 'string', hint: 'e.g. SV727' },
  { key: 'outboundBaggagePieces', kind: 'number' },
  { key: 'outboundBaggageKg', kind: 'number', hint: 'per bag' },
  { key: 'outboundStops', kind: 'stops' },
  { key: 'inboundDepartureCity', kind: 'string' },
  { key: 'inboundArrivalCity', kind: 'string' },
  { key: 'inboundDepartureTime', kind: 'time' },
  { key: 'inboundArrivalTime', kind: 'time' },
  { key: 'inboundFlightCode', kind: 'string' },
  { key: 'inboundBaggagePieces', kind: 'number' },
  { key: 'inboundBaggageKg', kind: 'number' },
  { key: 'inboundStops', kind: 'stops' },
  { key: 'mealIncluded', kind: 'boolean' },
  { key: 'roundIssuanceDate', kind: 'date', hint: 'EMD / deposit issue date' },
  { key: 'roundPaymentPct', kind: 'number', hint: 'deposit %, e.g. 30' },
  { key: 'roundEmdAmount', kind: 'number' },
  { key: 'roundEmdNumber', kind: 'string' },
  { key: 'roundDeadlineDate', kind: 'date', hint: 'deposit due / time limit date' },
  { key: 'roundDeadlineTime', kind: 'time' },
];

const KIND_LABEL: Record<Kind, string> = {
  string: 'text',
  number: 'number',
  date: 'YYYY-MM-DD',
  time: 'HH:mm',
  boolean: 'true/false',
  stops: 'list of {city, flightCode, arrivalTime, departureTime}',
  tripType: '"one_way" or "round_trip"',
};

/** One line per field for the prompt — compact enough for Groq's token budget. */
export function fieldListForPrompt(): string {
  return BOOKING_FIELDS.map((f) => `- ${f.key}: ${KIND_LABEL[f.kind]}${f.hint ? ` (${f.hint})` : ''}`).join('\n');
}
