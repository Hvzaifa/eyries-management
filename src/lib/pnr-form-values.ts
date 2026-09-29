/**
 * The shape of the create/edit booking form, and its blank starting values.
 *
 * These live here rather than in `components/pnr-form.tsx` because that file is
 * a `'use client'` module. Every value exported from a client module is replaced
 * by a *client reference* stub in the server bundle, so a server component that
 * did `{ ...EMPTY_PNR, branchId }` spread the stub instead of the defaults and
 * handed the form an object with no `pnr` — crashing the render on
 * `values.pnr.trim()`. Types are erased at compile time and were never affected;
 * only the constant was. Keep plain values a server component needs out of
 * client modules.
 */

/** One stop on a connecting flight, as the form holds it. */
export interface StopFormValues {
  city: string;
  /** The onward flight from the stop; blank = the same flight continues. */
  flightCode: string;
  arrivalTime: string;
  departureTime: string;
}

export const EMPTY_STOP: StopFormValues = { city: '', flightCode: '', arrivalTime: '', departureTime: '' };

export interface PnrFormValues {
  id?: string;
  requestDate: string;
  investorCompany: string;
  licenseId: string;
  branchId: string;
  pnr: string;
  gdsPnr: string;
  segment: string;
  airlineId: string;
  seats: string;
  pnrTlDate: string;
  status: string;
  /** 'one_way' | 'round_trip' — see src/lib/flight-details.ts */
  tripType: string;
  /** The outbound departure date; on a one-way trip, the only flight's. */
  outboundDate: string;
  outboundDepartureCity: string;
  outboundArrivalCity: string;
  outboundDepartureTime: string;
  outboundArrivalTime: string;
  outboundFlightCode: string;
  /** Bags per passenger, and the kg limit per bag. */
  outboundBaggagePieces: string;
  outboundBaggageKg: string;
  outboundStops: StopFormValues[];
  /** The inbound departure date. */
  inboundDate: string;
  inboundDepartureCity: string;
  inboundArrivalCity: string;
  inboundDepartureTime: string;
  inboundArrivalTime: string;
  inboundFlightCode: string;
  inboundBaggagePieces: string;
  inboundBaggageKg: string;
  inboundStops: StopFormValues[];
  /** 'yes' | 'no' — meal included in the package, for the booking as a whole. */
  mealIncluded: string;
  fare: string;
  airlineTaxes: string;
  psf: string;
}

export const EMPTY_PNR: PnrFormValues = {
  requestDate: '',
  investorCompany: '',
  licenseId: '',
  branchId: '',
  pnr: '',
  gdsPnr: '',
  segment: '',
  airlineId: '',
  seats: '',
  pnrTlDate: '',
  status: 'active',
  tripType: 'round_trip',
  outboundDate: '',
  outboundDepartureCity: '',
  outboundArrivalCity: '',
  outboundDepartureTime: '',
  outboundArrivalTime: '',
  outboundFlightCode: '',
  outboundBaggagePieces: '',
  outboundBaggageKg: '',
  outboundStops: [],
  inboundDate: '',
  inboundDepartureCity: '',
  inboundArrivalCity: '',
  inboundDepartureTime: '',
  inboundArrivalTime: '',
  inboundFlightCode: '',
  inboundBaggagePieces: '',
  inboundBaggageKg: '',
  inboundStops: [],
  mealIncluded: 'no',
  fare: '',
  airlineTaxes: '',
  psf: '',
};
