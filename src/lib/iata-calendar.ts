/**
 * The IATA remittance calendar — when an issued EMD must be PAID.
 *
 * Two different clocks govern an EMD and they must never be confused:
 *
 *   - **Issuance** is the airline's business. Issuing an EMD is what secures
 *     the PNR, and the airline's own policy sets the time limit
 *     (`emd_rounds.deadline_date`, see `emd.ts`).
 *   - **Payment** is IATA's business. IATA bills in fixed periods and settles
 *     on a fixed day per period. That is what this file models.
 *
 * Until 2026-09-22 this system deliberately modelled no payment date at all,
 * because none had been specified — the `paid` status was removed on
 * 2026-09-21 for exactly that reason. The owner has now supplied the calendar
 * (`IATA-Calender.pdf`, downloaded 21 Sep 2026) and the rule that reads it:
 *
 * > *"There are fields called billing from and billing to. If an EMD is issued
 * > between these dates then the corresponding Remittance Day is the deadline
 * > to make payment to IATA. Only consider those rows that contain Remittance
 * > Frequency as 4 times per month."*
 *
 * **Only the "4 times per month" rows are in here.** The PDF also carries 365
 * daily rows with a frequency of `EasyPay`, which is a different settlement
 * product and explicitly not ours. The `Billing Availability` column is
 * likewise unused: it is the day the invoice becomes downloadable, not a date
 * anyone has to act on.
 *
 * **These figures are transcribed from the PDF, not computed.** The lag from
 * the close of a billing period to its remittance day runs between 7 and 10
 * days with no derivable pattern — it moves with weekends and holidays — so
 * there is no formula to fall back on and nothing here may be extrapolated.
 * When the calendar runs out the honest answer is "not known yet"; see
 * `iataPaymentDeadline`.
 */

export interface IataPeriod {
  /** IATA's own period code, e.g. `20260903W`. Shown so a figure can be traced back to the PDF. */
  code: string;
  /** First day of the billing window (inclusive), ISO `YYYY-MM-DD`. */
  billingFrom: string;
  /** Last day of the billing window (inclusive). */
  billingTo: string;
  /** The day payment must reach IATA for everything billed in this window. */
  remittanceDay: string;
}

/**
 * Every "4 times per month" period in the supplied calendar, in order.
 *
 * The owner asked for "onwards of today's date till what it is available".
 * The whole of 2026 is here rather than only the remainder: the earlier
 * periods cost nothing, and without them an EMD issued earlier this year would
 * report "no payment date" when in fact the date is known and has passed.
 * Nothing outside the published range is present.
 *
 * Source: IATA-Calender.pdf, Pakistan (PKR), downloaded 21 Sep 2026.
 */
export const IATA_PERIODS: readonly IataPeriod[] = [
  { code: '20260101W', billingFrom: '2026-01-01', billingTo: '2026-01-07', remittanceDay: '2026-01-14' },
  { code: '20260102W', billingFrom: '2026-01-08', billingTo: '2026-01-15', remittanceDay: '2026-01-22' },
  { code: '20260103W', billingFrom: '2026-01-16', billingTo: '2026-01-23', remittanceDay: '2026-01-30' },
  { code: '20260104W', billingFrom: '2026-01-24', billingTo: '2026-01-31', remittanceDay: '2026-02-09' },
  { code: '20260201W', billingFrom: '2026-02-01', billingTo: '2026-02-07', remittanceDay: '2026-02-16' },
  { code: '20260202W', billingFrom: '2026-02-08', billingTo: '2026-02-15', remittanceDay: '2026-02-23' },
  { code: '20260203W', billingFrom: '2026-02-16', billingTo: '2026-02-23', remittanceDay: '2026-03-02' },
  { code: '20260204W', billingFrom: '2026-02-24', billingTo: '2026-02-28', remittanceDay: '2026-03-09' },
  { code: '20260301W', billingFrom: '2026-03-01', billingTo: '2026-03-07', remittanceDay: '2026-03-16' },
  { code: '20260302W', billingFrom: '2026-03-08', billingTo: '2026-03-15', remittanceDay: '2026-03-24' },
  { code: '20260303W', billingFrom: '2026-03-16', billingTo: '2026-03-23', remittanceDay: '2026-03-30' },
  { code: '20260304W', billingFrom: '2026-03-24', billingTo: '2026-03-31', remittanceDay: '2026-04-07' },
  { code: '20260401W', billingFrom: '2026-04-01', billingTo: '2026-04-07', remittanceDay: '2026-04-14' },
  { code: '20260402W', billingFrom: '2026-04-08', billingTo: '2026-04-15', remittanceDay: '2026-04-22' },
  { code: '20260403W', billingFrom: '2026-04-16', billingTo: '2026-04-23', remittanceDay: '2026-04-30' },
  { code: '20260404W', billingFrom: '2026-04-24', billingTo: '2026-04-30', remittanceDay: '2026-05-07' },
  { code: '20260501W', billingFrom: '2026-05-01', billingTo: '2026-05-07', remittanceDay: '2026-05-14' },
  { code: '20260502W', billingFrom: '2026-05-08', billingTo: '2026-05-15', remittanceDay: '2026-05-22' },
  { code: '20260503W', billingFrom: '2026-05-16', billingTo: '2026-05-23', remittanceDay: '2026-06-01' },
  { code: '20260504W', billingFrom: '2026-05-24', billingTo: '2026-05-31', remittanceDay: '2026-06-08' },
  { code: '20260601W', billingFrom: '2026-06-01', billingTo: '2026-06-07', remittanceDay: '2026-06-15' },
  { code: '20260602W', billingFrom: '2026-06-08', billingTo: '2026-06-15', remittanceDay: '2026-06-22' },
  { code: '20260603W', billingFrom: '2026-06-16', billingTo: '2026-06-23', remittanceDay: '2026-06-30' },
  { code: '20260604W', billingFrom: '2026-06-24', billingTo: '2026-06-30', remittanceDay: '2026-07-07' },
  { code: '20260701W', billingFrom: '2026-07-01', billingTo: '2026-07-07', remittanceDay: '2026-07-14' },
  { code: '20260702W', billingFrom: '2026-07-08', billingTo: '2026-07-15', remittanceDay: '2026-07-22' },
  { code: '20260703W', billingFrom: '2026-07-16', billingTo: '2026-07-23', remittanceDay: '2026-07-30' },
  { code: '20260704W', billingFrom: '2026-07-24', billingTo: '2026-07-31', remittanceDay: '2026-08-07' },
  { code: '20260801W', billingFrom: '2026-08-01', billingTo: '2026-08-07', remittanceDay: '2026-08-17' },
  { code: '20260802W', billingFrom: '2026-08-08', billingTo: '2026-08-15', remittanceDay: '2026-08-24' },
  { code: '20260803W', billingFrom: '2026-08-16', billingTo: '2026-08-23', remittanceDay: '2026-08-31' },
  { code: '20260804W', billingFrom: '2026-08-24', billingTo: '2026-08-31', remittanceDay: '2026-09-07' },
  { code: '20260901W', billingFrom: '2026-09-01', billingTo: '2026-09-07', remittanceDay: '2026-09-14' },
  { code: '20260902W', billingFrom: '2026-09-08', billingTo: '2026-09-15', remittanceDay: '2026-09-22' },
  { code: '20260903W', billingFrom: '2026-09-16', billingTo: '2026-09-23', remittanceDay: '2026-09-30' },
  { code: '20260904W', billingFrom: '2026-09-24', billingTo: '2026-09-30', remittanceDay: '2026-10-07' },
  { code: '20261001W', billingFrom: '2026-10-01', billingTo: '2026-10-07', remittanceDay: '2026-10-14' },
  { code: '20261002W', billingFrom: '2026-10-08', billingTo: '2026-10-15', remittanceDay: '2026-10-22' },
  { code: '20261003W', billingFrom: '2026-10-16', billingTo: '2026-10-23', remittanceDay: '2026-10-30' },
  { code: '20261004W', billingFrom: '2026-10-24', billingTo: '2026-10-31', remittanceDay: '2026-11-09' },
  { code: '20261101W', billingFrom: '2026-11-01', billingTo: '2026-11-07', remittanceDay: '2026-11-16' },
  { code: '20261102W', billingFrom: '2026-11-08', billingTo: '2026-11-15', remittanceDay: '2026-11-23' },
  { code: '20261103W', billingFrom: '2026-11-16', billingTo: '2026-11-23', remittanceDay: '2026-11-30' },
  { code: '20261104W', billingFrom: '2026-11-24', billingTo: '2026-11-30', remittanceDay: '2026-12-07' },
  { code: '20261201W', billingFrom: '2026-12-01', billingTo: '2026-12-07', remittanceDay: '2026-12-14' },
  { code: '20261202W', billingFrom: '2026-12-08', billingTo: '2026-12-15', remittanceDay: '2026-12-22' },
  { code: '20261203W', billingFrom: '2026-12-16', billingTo: '2026-12-23', remittanceDay: '2026-12-30' },
  { code: '20261204W', billingFrom: '2026-12-24', billingTo: '2026-12-31', remittanceDay: '2027-01-07' },] as const;

/** First day the calendar covers. An EMD issued before this has no known period. */
export const IATA_CALENDAR_FROM = IATA_PERIODS[0].billingFrom;

/**
 * Last day the calendar covers. An EMD issued after this needs next year's
 * calendar loading — see `iataCalendarGapNotice`.
 */
export const IATA_CALENDAR_TO = IATA_PERIODS[IATA_PERIODS.length - 1].billingTo;

/**
 * The billing period an EMD issued on `issuanceIso` falls into, or `null` when
 * the date lies outside the loaded calendar.
 *
 * The windows are contiguous and non-overlapping across the whole year (proved
 * in the tests), so at most one period can ever match.
 */
export function iataPeriodFor(issuanceIso: string | null | undefined): IataPeriod | null {
  if (!issuanceIso) return null;
  const day = issuanceIso.slice(0, 10);
  return (
    IATA_PERIODS.find((p) => p.billingFrom <= day && day <= p.billingTo) ?? null
  );
}

/**
 * The date IATA must be paid for an EMD issued on `issuanceIso`, or `null`
 * when the calendar does not cover that date.
 *
 * `null` means "not known", never "none" and never "overdue". A missing
 * payment date must be displayed as a gap to be filled, because the obligation
 * exists whether or not this system can name the day.
 */
export function iataPaymentDeadline(issuanceIso: string | null | undefined): string | null {
  return iataPeriodFor(issuanceIso)?.remittanceDay ?? null;
}

/**
 * Why a date has no period, phrased for a staff member rather than a developer.
 * `null` when the date is covered and there is nothing to explain.
 */
export function iataCalendarGapNotice(issuanceIso: string | null | undefined): string | null {
  if (!issuanceIso) return null;
  const day = issuanceIso.slice(0, 10);
  if (iataPeriodFor(day)) return null;
  if (day > IATA_CALENDAR_TO) {
    return `The IATA calendar loaded here ends on ${IATA_CALENDAR_TO}. Load the next one to get payment dates after that.`;
  }
  return `The IATA calendar loaded here starts on ${IATA_CALENDAR_FROM}, so there is no payment date for ${day}.`;
}

/**
 * Remittance days from `fromIso` onwards, earliest first — the settlement
 * dates still ahead of the company.
 *
 * Several billing periods can share a remittance day in principle, so the days
 * are de-duplicated: this answers "when do we next have to pay IATA", and two
 * entries for one date would be two answers to one question.
 */
export function upcomingRemittanceDays(fromIso: string): string[] {
  const days = IATA_PERIODS.filter((p) => p.remittanceDay >= fromIso).map((p) => p.remittanceDay);
  return [...new Set(days)].sort();
}
