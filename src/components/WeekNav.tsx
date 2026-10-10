import { useRef } from 'react';
import { addDays, isoWeek, shortDate, startOfWeek, todayISO } from '../model/dates';
import type { ISODate } from '../model/types';
import { href, navigate } from '../router';

/**
 * Prev/next arrows plus a date picker: pick any day to jump to its week.
 * (A date input rather than `type="week"`, which Firefox doesn't support.)
 */
export function WeekNav({ view, monday }: { view: 'week' | 'calendar'; monday: ISODate }) {
  const picker = useRef<HTMLInputElement>(null);
  const thisWeek = startOfWeek(todayISO());
  const go = (date: string) => date && navigate({ name: view, week: startOfWeek(date) === thisWeek ? undefined : startOfWeek(date) });

  return (
    <div className="flex items-center gap-1">
      <a className="btn-ghost" href={href({ name: view, week: addDays(monday, -7) })} title="Previous week">
        ←
      </a>
      <a className="btn-ghost" href={href({ name: view, week: addDays(monday, 7) })} title="Next week">
        →
      </a>
      <span className="relative">
        <button
          className="rounded px-1.5 py-0.5 font-mono text-[12px] text-strong hover:bg-raised"
          title="Pick a week"
          onClick={() => {
            try {
              picker.current?.showPicker();
            } catch {
              picker.current?.focus();
            }
          }}
        >
          <span className="text-dim">W{isoWeek(monday)}</span> {shortDate(monday)} – {shortDate(addDays(monday, 6))} ▾
        </button>
        <input
          ref={picker}
          type="date"
          aria-label="Jump to week containing date"
          tabIndex={-1}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
          value={monday}
          onChange={(e) => go(e.target.value)}
        />
      </span>
      {monday !== thisWeek && (
        <a className="btn-ghost text-[11px]" href={href({ name: view })}>
          today
        </a>
      )}
    </div>
  );
}
