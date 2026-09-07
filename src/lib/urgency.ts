export type Urgency = 'red' | 'amber' | 'green' | 'grey';

export function todayIsoInPkt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function diffInDays(todayIso: string, deadlineIso: string): number {
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [dy, dm, dd] = deadlineIso.split('-').map(Number);
  const from = Date.UTC(ty, tm - 1, td);
  const to = Date.UTC(dy, dm - 1, dd);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Urgency colour for a PNR row (Phase 1 Step 3):
 *   grey   — PNR status is not 'active'
 *   red    — nearest issued deadline is today or within 2 days (incl. overdue)
 *   amber  — nearest issued deadline within 5 days
 *   green  — otherwise, or no issued rounds at all
 * Only emd_rounds with status = 'issued' count as unresolved
 * (docs/decisions.md, 2026-08-23).
 */
export function getUrgency(
  todayIso: string,
  nearestPendingDeadlineIso: string | null,
  pnrStatus: string
): Urgency {
  if (pnrStatus !== 'active') return 'grey';
  if (!nearestPendingDeadlineIso) return 'green';
  const days = diffInDays(todayIso, nearestPendingDeadlineIso);
  if (days <= 2) return 'red';
  if (days <= 5) return 'amber';
  return 'green';
}

/**
 * True when two dates represent the same instant (or are both null).
 *
 * Exists because `a !== b` on two Date objects compares object identity, not
 * value — it is ALWAYS true for two separate Date objects, even when they hold
 * the same moment. Used as a change-detector that makes every save look like an
 * edit, so any "has this date changed?" check must go through here.
 */
export function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}
