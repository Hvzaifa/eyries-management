'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { orderedRange, type IssuanceRange } from '@/lib/issuance';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Calendar maths on ISO strings in UTC, so the browser's timezone cannot shift a day. */
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parts = (s: string) => s.split('-').map(Number) as [number, number, number];

function shortDate(s: string, withYear: boolean) {
  const [y, m, d] = parts(s);
  return `${d} ${SHORT[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export function rangeLabel(r: IssuanceRange): string {
  if (r.from === r.to) return shortDate(r.from, true);
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${shortDate(r.from, !sameYear)} – ${shortDate(r.to, true)}`;
}

/**
 * One calendar for one day or a range (owner, 2026-09-29). The first click
 * picks a single day — applied at once — and a second click makes it a range
 * from the first; a third click starts again. Days with EMDs due are dotted.
 */
export default function DateRangePicker({
  value,
  onChange,
  markedDays,
  todayIso,
}: {
  value: IssuanceRange | null;
  onChange: (range: IssuanceRange | null) => void;
  markedDays: Set<string>;
  todayIso: string;
}) {
  const [open, setOpen] = useState(false);
  // The day a range is being drawn from, between the first and second click.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const start = parts(value?.from ?? todayIso);
  const [view, setView] = useState<{ y: number; m: number }>({ y: start[0], m: start[1] - 1 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) {
        setOpen(false);
        setAnchor(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(view.y, view.m, i + 1))];
  }, [view]);

  // While a range is being drawn, preview it up to the hovered day.
  const shown: IssuanceRange | null = anchor ? orderedRange(anchor, hover ?? anchor) : value;

  const pick = (d: string) => {
    if (anchor) {
      onChange(orderedRange(anchor, d));
      setAnchor(null);
    } else {
      onChange({ from: d, to: d });
      setAnchor(d);
    }
  };

  const step = (by: number) => setView((v) => ({ y: v.y + Math.floor((v.m + by) / 12), m: (((v.m + by) % 12) + 12) % 12 }));

  return (
    <div ref={box} className="relative flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-stone-500 whitespace-nowrap">EMDs to issue</span>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAnchor(null);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-700 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-light/50"
      >
        <CalendarDays className="w-3.5 h-3.5 text-stone-400" />
        {value ? rangeLabel(value) : 'Pick a day or range'}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setAnchor(null);
          }}
          title="Clear the dates"
          className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Pick a day or a range"
          className="absolute top-full left-0 mt-2 z-30 w-[288px] rounded-2xl border border-stone-200 bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer">
              <ChevronLeft className="w-4 h-4 text-stone-500" />
            </button>
            <span className="text-xs font-semibold text-stone-800">
              {MONTHS[view.m]} {view.y}
            </span>
            <button type="button" onClick={() => step(1)} aria-label="Next month" className="p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer">
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-medium text-stone-400 mb-1">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setHover(null)}>
            {cells.map((d, i) => {
              if (!d) return <span key={`blank-${i}`} />;
              const inRange = !!shown && d >= shown.from && d <= shown.to;
              const edge = !!shown && (d === shown.from || d === shown.to);
              const marked = markedDays.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pick(d)}
                  onMouseEnter={() => setHover(d)}
                  aria-label={`${shortDate(d, true)}${marked ? ', EMDs due' : ''}`}
                  aria-pressed={inRange}
                  className={`relative h-8 text-xs tabular-nums cursor-pointer transition-colors ${
                    edge
                      ? 'bg-brand text-white font-semibold rounded-lg'
                      : inRange
                        ? 'bg-brand-100 text-brand-dark'
                        : `rounded-lg hover:bg-stone-100 ${d === todayIso ? 'text-brand font-semibold' : 'text-stone-700'}`
                  }`}
                >
                  {Number(d.slice(8))}
                  {marked && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${edge ? 'bg-white' : 'bg-rose-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-stone-400">
              {anchor ? 'Click another day for a range' : (
                <>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 align-middle mr-1" />
                  EMDs due
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAnchor(null);
              }}
              className="px-3 py-1 rounded-lg font-semibold text-brand-dark hover:bg-brand-50 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
