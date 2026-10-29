import { diffInDays } from '@/lib/urgency';

/**
 * Flights given sector by sector, as booking-portal exports write them
 * (`flight_code_sector_1`, `from_sector_code_sector_1`, …), turned into the
 * outbound and return flights the form holds. Pure, and tested.
 */

export interface Sector {
  flightCode: string | null;
  from: string | null;
  to: string | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  baggage: string | null;
}

/** A sector that departs this many days or more after the one before it starts the return flight. */
export const RETURN_GAP_DAYS = 2;

/**
 * Splits a booking's sectors into the outbound and return flights.
 *
 * By dates (owner's export, 2026-10-20): a sector departing the same day as
 * the one before it, or the next day, is a connection; one departing two or
 * more days later starts the return. The export's destination column was not
 * used: on about 1,300 of its rows it names the home city.
 *
 * Without a date on every sector, only an even number of sectors that ends
 * where it started is split, half and half; anything else is read as outbound
 * only, and `certain` is false so the form marks it for checking.
 */
export function splitSectors<T extends Pick<Sector, 'from' | 'to' | 'departureDate'>>(
  sectors: T[]
): { outbound: T[]; inbound: T[]; certain: boolean } {
  if (sectors.length <= 1) return { outbound: sectors, inbound: [], certain: true };
  if (sectors.every((s) => s.departureDate)) {
    const at = sectors.findIndex(
      (s, i) => i > 0 && diffInDays(sectors[i - 1].departureDate!, s.departureDate!) >= RETURN_GAP_DAYS
    );
    return at < 0
      ? { outbound: sectors, inbound: [], certain: true }
      : { outbound: sectors.slice(0, at), inbound: sectors.slice(at), certain: true };
  }
  const first = sectors[0];
  const last = sectors[sectors.length - 1];
  const home = !!first.from && first.from === last.to;
  if (home && sectors.length % 2 === 0) {
    const half = sectors.length / 2;
    return { outbound: sectors.slice(0, half), inbound: sectors.slice(half), certain: false };
  }
  return { outbound: sectors, inbound: [], certain: false };
}

/**
 * The day a flight lands, from its departure date and the two local times:
 * the next day when it lands at an earlier time than it left (JED 18:10 → ISB
 * 01:10), otherwise the departure day. Null without a date or both times.
 *
 * An export's own arrival date is never used (owner, 2026-10-20): on
 * GRP_Inventory.xlsx it was wrong on about one sector in five — 1,808 sectors
 * dated an overnight arrival the same day, and 142 more were weeks away from
 * the flight or before it. Uploads mark the result for the reviewer to check.
 */
export function arrivalDateFromTimes(
  departureDate: string | null,
  departureTime: string | null,
  arrivalTime: string | null
): string | null {
  if (!departureDate || !departureTime || !arrivalTime) return null;
  if (arrivalTime >= departureTime) return departureDate;
  const [y, m, d] = departureDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Checked-in baggage from luggage text: `1 PC 30KG - 7 KG` and `1 PC 23KG 7KG`
 * are one piece of 30 kg and 23 kg (the second weight, and anything after a
 * dash, is the hand carry). `30KG` alone gives the weight only; `2PC` the
 * pieces only. Anything else reads as nothing.
 */
export function parseLuggage(text: string | null): { pieces: number | null; kg: number | null } {
  const checked = String(text ?? '').split(/\s-\s/)[0].toUpperCase();
  const pieces = checked.match(/(\d+)\s*(PC|PCS|PIECE|PIECES)\b/);
  const kg = checked.match(/(\d+)\s*KGS?\b/);
  return { pieces: pieces ? Number(pieces[1]) : null, kg: kg ? Number(kg[1]) : null };
}
