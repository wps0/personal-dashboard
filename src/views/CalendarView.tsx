import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { MiniMonth } from '../components/MiniMonth';
import { MonthGrid } from '../components/MonthGrid';
import { TimeGrid } from '../components/TimeGrid';
import { draftAt } from '../components/EventEditor';
import { Select } from '../components/ui/Select';
import { addDays, addMonths, firstOfMonth, formatMonthYear, monthGrid, startOfWeek, todayISO } from '../model/dates';
import type { ISODate } from '../model/types';
import { navigate, type CalView } from '../router';
import { useStore } from '../store';
import { useUi } from '../ui';

const VIEW_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: '3day', label: '3 days' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

const VIEW_KEY = 'personal-dashboard/calendar-view';

function lastView(): CalView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'day' || v === '3day' || v === 'month' ? v : 'week';
  } catch {
    return 'week';
  }
}

/** The days a view shows for an anchor date. */
function visibleDays(view: CalView, date: ISODate): ISODate[] {
  switch (view) {
    case 'day':
      return [date];
    case '3day':
      return [date, addDays(date, 1), addDays(date, 2)];
    case 'week': {
      const monday = startOfWeek(date);
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    }
    case 'month':
      return monthGrid(date);
  }
}

function step(view: CalView, date: ISODate, dir: 1 | -1): ISODate {
  if (view === 'month') return addMonths(date, dir);
  return addDays(date, dir * (view === 'day' ? 1 : view === '3day' ? 3 : 7));
}

/** "October 2026", or "Sep – Oct 2026" when the range spans months. */
function title(view: CalView, days: ISODate[], date: ISODate): string {
  if (view === 'month') return formatMonthYear(date);
  const a = days[0];
  const b = days[days.length - 1];
  if (a.slice(0, 7) === b.slice(0, 7)) return formatMonthYear(a);
  const fmt = (d: ISODate, year: boolean) => new Intl.DateTimeFormat('en-GB', { month: 'short', ...(year && { year: 'numeric' }) }).format(new Date(d + 'T00:00'));
  return a.slice(0, 4) === b.slice(0, 4) ? `${fmt(a, false)} – ${fmt(b, true)}` : `${fmt(a, true)} – ${fmt(b, true)}`;
}

export function CalendarView({ view: routeView, date: routeDate }: { view?: CalView; date?: ISODate }) {
  const view = routeView ?? lastView();
  const today = todayISO();
  const date = routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : today;
  const days = useMemo(() => visibleDays(view, view === 'month' ? firstOfMonth(date) : date), [view, date]);
  const go = (v: CalView, d: ISODate) => navigate({ name: 'calendar', view: v, date: d === today ? undefined : d });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Per-device convenience only.
    }
  }, [view]);

  // If the draft's date is changed to one outside the view, follow it.
  const draftDate = useUi((s) => s.draft?.date);
  useEffect(() => {
    if (draftDate && !days.includes(draftDate)) go(view, draftDate);
  }, [draftDate]);

  const range: [ISODate, ISODate] = view === 'month' ? [firstOfMonth(date), addDays(addMonths(date, 1), -1)] : [days[0], days[days.length - 1]];

  return (
    <div className="flex h-full">
      <aside className="hidden w-[248px] shrink-0 flex-col gap-4 overflow-y-auto px-3 py-3 lg:flex">
        <button
          className="flex h-12 w-fit items-center gap-2 rounded-2xl bg-raised pr-5 pl-4 font-medium text-strong shadow-md ring-1 ring-line hover:brightness-110"
          onClick={() => {
            const start = Math.min(new Date().getHours() + 1, 22) * 60;
            if (!days.includes(today)) go(view, today);
            useUi.getState().setDraft(draftAt(today, start));
          }}
        >
          <Plus size={20} className="text-accent" /> Create
        </button>
        <MiniMonth selected={date} range={range} onSelect={(d) => go(view, d)} />
        <Layers />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-3 py-2">
          <button className="btn h-8 rounded-full px-4" onClick={() => go(view, today)}>
            Today
          </button>
          <button className="icon-btn" aria-label="Previous" onClick={() => go(view, step(view, date, -1))}>
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => go(view, step(view, date, 1))}>
            <ChevronRight size={18} />
          </button>
          <h1 className="ml-1 text-lg font-normal text-strong">{title(view, days, date)}</h1>
          <Select
            value={view}
            onChange={(v) => go(v, date)}
            options={VIEW_OPTIONS}
            className="ml-auto h-8 w-28 rounded-full px-3"
            ariaLabel="Calendar view"
          />
        </div>
        <div className="min-h-0 flex-1 pr-2 pb-2">
          {view === 'month' ? (
            <MonthGrid date={firstOfMonth(date)} onDayClick={(d) => go('day', d)} />
          ) : (
            <TimeGrid key={view} days={days} onDayClick={(d) => go('day', d)} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Sidebar toggles: show or hide events and each area's planned sessions (per device). */
function Layers() {
  const areas = useStore((s) => s.data.areas);
  const hidden = useUi((s) => s.hidden);
  const toggle = useUi((s) => s.toggleHidden);
  const rows = [{ key: 'events', name: 'Events', color: 'var(--color-event)' }, ...areas.map((a) => ({ key: a.id, name: a.name, color: a.color }))];
  return (
    <div>
      <div className="mb-1 px-1 text-[13px] font-medium text-strong">My calendars</div>
      {rows.map((r) => {
        const on = !hidden.includes(r.key);
        return (
          <label key={r.key} className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-raised">
            <span
              className="flex h-4 w-4 items-center justify-center rounded-[3px] border-2"
              style={{ borderColor: r.color, background: on ? r.color : 'transparent' }}
            >
              {on && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="var(--color-on-block)" strokeWidth="2">
                  <path d="M2.5 6.5 5 9l4.5-5.5" />
                </svg>
              )}
            </span>
            <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(r.key)} />
            <span className="truncate">{r.name}</span>
          </label>
        );
      })}
    </div>
  );
}
