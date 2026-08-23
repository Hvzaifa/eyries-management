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
 *   red    — nearest pending deadline is today or within 2 days (incl. overdue)
 *   amber  — nearest pending deadline within 5 days
 *   green  — otherwise, or no pending rounds at all
 * Only emd_rounds with status = 'pending' count as unresolved
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
