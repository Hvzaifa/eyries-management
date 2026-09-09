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
  outboundDate: string;
  inboundDate: string;
  sector: string;
  pnrTlDate: string;
  dealPct: string;
  issuedStatus: string;
  status: string;
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
  outboundDate: '',
  inboundDate: '',
  sector: '',
  pnrTlDate: '',
  dealPct: '',
  issuedStatus: 'unissued',
  status: 'active',
  fare: '',
  airlineTaxes: '',
  psf: '',
};
