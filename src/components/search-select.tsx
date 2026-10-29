'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { matchLookupOptions, type LookupOption } from '@/lib/lookups';

/**
 * A dropdown that can be typed into (owner, 2026-10-19): type part of a code or
 * a name and the matching choices are suggested beneath, best match first.
 *
 * Posts the chosen option's `value` under `name` through a hidden input, exactly
 * as the `<select>` it replaces did, so the server actions are unchanged. Text
 * that matches no choice is never posted: leaving the box puts back the last
 * choice made, or clears it when the box was emptied.
 */
export default function SearchSelect({
  name,
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  name: string;
  options: LookupOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const labelOf = (o: LookupOption) => `${o.code} — ${o.name}`;

  const [query, setQuery] = useState<string | null>(null); // null = not typing
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => matchLookupOptions(options, query ?? ''), [options, query]);

  const choose = (o: LookupOption | null) => {
    onChange(o ? o.value : '');
    setQuery(null);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Never submit the whole booking form from the suggestion box.
      if (open) {
        e.preventDefault();
        if (matches[active]) choose(matches[active]);
      }
    } else if (e.key === 'Escape') {
      setQuery(null);
      setOpen(false);
    }
  };

  const onBlur = () => {
    // An emptied box clears the choice; anything else that was typed and not
    // picked is dropped, and the previous choice shows again.
    if (query !== null && query.trim() === '') onChange('');
    setQuery(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query ?? (selected ? labelOf(selected) : '')}
        placeholder={placeholder ?? 'Type to search…'}
        onFocus={(e) => {
          e.target.select();
          setActive(0);
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={className}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-stone-400">No match</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                // mousedown, not click: click fires after the input's blur,
                // which would already have closed the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer gap-2 px-3 py-1.5 ${i === active ? 'bg-stone-100' : ''} ${
                  o.value === value ? 'font-medium text-brand-dark' : 'text-stone-700'
                }`}
              >
                <span className="w-16 shrink-0 font-mono">{o.code}</span>
                <span className="truncate">{o.name}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
