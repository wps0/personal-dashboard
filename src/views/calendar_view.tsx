import {ChevronLeft, ChevronRight, Menu, Plus, RefreshCw} from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {MiniMonth} from '../components/mini_month';
import {MonthGrid} from '../components/month_grid';
import {TimeGrid} from '../components/time_grid';

import {Select} from '../components/ui/select';
import {
  addDays,
  addMonths,
  firstOfMonth,
  formatMonthYear,
  isISODate,
  monthGrid,
  startOfWeek,
  type DayOfWeek,
} from '../model/dates';
import {shownEvent} from '../model/recurrence';
import {calViewOf, type ISODate} from '../model/types';
import {href, navigate, type CalView} from '../router';
import {calendarConnected, useGoogle} from '../google/auth';
import {useGoogleCalendars} from '../google/calendars';
import {clearGoogleCache} from '../google/use_google_events';
import {GoogleErrorNotice} from '../components/google_error_notice';
import {useStore} from '../store';
import {nextHourDraft, useUi} from '../ui';
import {useNavTarget} from '../keyboard';
import {useMediaQuery, useToday, useWeekStart} from '../hooks';
import {unreachable} from '../unreachable';

const VIEW_OPTIONS = [
  {value: 'day', label: 'Day'},
  {value: '3day', label: '3 days'},
  {value: 'week', label: 'Week'},
  {value: 'month', label: 'Month'},
] as const;

/** The days a view shows for an anchor date, weeks starting on `weekStart`. */
function visibleDays(
  view: CalView,
  date: ISODate,
  weekStart: DayOfWeek,
): ISODate[] {
  switch (view) {
    case 'day':
      return [date];
    case '3day':
      return [date, addDays(date, 1), addDays(date, 2)];
    case 'week': {
      const start = startOfWeek(date, weekStart);
      return Array.from({length: 7}, (_, i) => addDays(start, i));
    }
    case 'month':
      return monthGrid(date, weekStart);
    default:
      return unreachable(view);
  }
}

function step(view: CalView, date: ISODate, dir: 1 | -1): ISODate {
  if (view === 'month') return addMonths(date, dir);
  return addDays(date, dir * (view === 'day' ? 1 : view === '3day' ? 3 : 7));
}

/**
 * "October 2026", or "Sep – Oct 2026" when the range spans months; `short`
 * (phones) always names months short: "Oct 2026".
 */
function title(
  view: CalView,
  days: ISODate[],
  date: ISODate,
  short = false,
): string {
  const fmt = (d: ISODate, year: boolean) =>
    new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      ...(year && {year: 'numeric'}),
    }).format(new Date(d + 'T00:00'));
  if (view === 'month') return short ? fmt(date, true) : formatMonthYear(date);
  const a = days[0];
  const b = days[days.length - 1];
  if (a.slice(0, 7) === b.slice(0, 7))
    return short ? fmt(a, true) : formatMonthYear(a);
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${fmt(a, false)} – ${fmt(b, true)}`
    : `${fmt(a, true)} – ${fmt(b, true)}`;
}

/** Whether the sidebar is hidden on wide screens; per device, like the theme. */
const SIDEBAR_KEY = 'personal-dashboard/calendar-sidebar';

function readSidebarShown(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

/**
 * The sidebar's ☰: on wide screens it shows or hides the sidebar beside the
 * calendar (remembered on this device); narrower, the sidebar opens over the
 * calendar until a tap outside, Esc, or a day picked in it.
 */
function useSidebar(): {
  wide: boolean;
  open: boolean;
  toggle(): void;
  close(): void;
} {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [shown, setShown] = useState(readSidebarShown);
  const [over, setOver] = useState(false);
  const open = wide ? shown : over;
  useEffect(() => {
    if (wide || !over) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [wide, over]);
  return {
    wide,
    open,
    toggle: () => {
      if (!wide) return setOver(o => !o);
      setShown(!shown);
      try {
        if (shown) localStorage.setItem(SIDEBAR_KEY, 'hidden');
        else localStorage.removeItem(SIDEBAR_KEY);
      } catch {
        // Storage blocked: the choice just won't outlive the tab.
      }
    },
    close: () => setOver(false),
  };
}

export function CalendarView({
  view: routeView,
  date: routeDate,
}: {
  view?: CalView;
  date?: ISODate;
}) {
  // Coming from another page (no view in the URL) always opens the default view.
  const defaultView = useStore(s =>
    calViewOf(s.data.settings.defaultCalendarView),
  );
  // A 7-day week is unreadable on a phone: there, the week default opens as
  // 3 days. A view chosen explicitly (in the URL) is kept.
  const phone = useMediaQuery('(max-width: 639px)');
  const view =
    routeView ?? (phone && defaultView === 'week' ? '3day' : defaultView);
  const weekStart = useWeekStart();
  const today = useToday();
  const date = routeDate && isISODate(routeDate) ? routeDate : today;
  const days = useMemo(
    () =>
      visibleDays(
        view,
        view === 'month' ? firstOfMonth(date) : date,
        weekStart,
      ),
    [view, date, weekStart],
  );
  const go = (v: CalView, d: ISODate) =>
    navigate({name: 'calendar', view: v, date: d === today ? undefined : d});

  // If the draft's or the open event's date is changed to one outside the
  // view, follow it, like Google Calendar.
  const draftDate = useUi(s => s.draft?.date);
  const openEventId = useUi(s => s.openEventId);
  const openEventDate = useStore(
    s => openEventId && shownEvent(s.data.events, openEventId)?.date,
  );
  const followed = draftDate ?? openEventDate;
  const follow = useEffectEvent((d: ISODate) => {
    if (!days.includes(d)) go(view, d);
  });
  useEffect(() => {
    if (followed) follow(followed);
  }, [followed]);

  useNavTarget({
    next: () => go(view, step(view, date, 1)),
    prev: () => go(view, step(view, date, -1)),
    today: () => go(view, today),
    goTo: d => go(view, d),
    view: v => go(v, date),
    create: () => {
      if (!days.includes(today)) go(view, today);
      useUi.getState().setDraft(nextHourDraft());
    },
  });

  const sidebar = useSidebar();
  // Over the calendar, picking a day or creating closes the sidebar.
  const fromSidebar = (act: () => void) => () => {
    act();
    if (!sidebar.wide) sidebar.close();
  };

  const range: [ISODate, ISODate] =
    view === 'month'
      ? [firstOfMonth(date), addDays(addMonths(date, 1), -1)]
      : [days[0], days[days.length - 1]];

  // Wide: the sidebar's width slides between 248px and 0, its content with it.
  // Narrow: it slides over the calendar from the left. Closed, it's inert.
  const slide =
    'duration-200 ease-[var(--ease-out-soft)] motion-reduce:transition-none';
  return (
    <div className="flex h-full flex-col">
      {/* Full width, ☰ first at the left, as in Google Calendar. */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 max-sm:gap-1 max-sm:px-2">
        <button
          className="icon-btn shrink-0"
          onClick={sidebar.toggle}
          aria-label={sidebar.open ? 'Hide the sidebar' : 'Show the sidebar'}
          aria-expanded={sidebar.open}
          aria-controls="calendar-sidebar"
          title={sidebar.open ? 'Hide the sidebar' : 'Show the sidebar'}
        >
          <Menu size={18} />
        </button>
        <button
          className="btn h-8 rounded-full px-4"
          onClick={() => go(view, today)}
          title="Today (t)"
        >
          Today
        </button>
        <button
          className="icon-btn"
          aria-label="Previous"
          title="Previous (k)"
          onClick={() => go(view, step(view, date, -1))}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="icon-btn"
          aria-label="Next"
          title="Next (j)"
          onClick={() => go(view, step(view, date, 1))}
        >
          <ChevronRight size={18} />
        </button>
        {/* On phones short, so it fits on one line beside the buttons. */}
        <h1 className="ml-1 truncate text-lg font-normal whitespace-nowrap text-strong">
          <span className="max-sm:hidden">{title(view, days, date)}</span>
          <span className="sm:hidden">{title(view, days, date, true)}</span>
        </h1>
        <Select
          value={view}
          onChange={v => go(v, date)}
          options={VIEW_OPTIONS}
          className="ml-auto h-8 w-28 rounded-full px-3"
          ariaLabel="Calendar view"
        />
      </div>
      <div className="relative flex min-h-0 flex-1">
        {!sidebar.wide && (
          <div
            aria-hidden
            className={`absolute inset-0 z-30 bg-black/40 transition-opacity ${slide} ${sidebar.open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={sidebar.close}
          />
        )}
        <aside
          id="calendar-sidebar"
          inert={!sidebar.open}
          className={
            sidebar.wide
              ? `shrink-0 overflow-hidden transition-[width] ${slide} ${sidebar.open ? 'w-[248px]' : 'w-0'}`
              : `absolute inset-y-0 left-0 z-40 w-[248px] bg-panel transition-transform ${slide} ${sidebar.open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`
          }
        >
          <div
            className={`flex h-full w-[248px] flex-col gap-4 overflow-y-auto px-3 py-3 ${sidebar.wide ? `transition-transform ${slide} ${sidebar.open ? '' : '-translate-x-full'}` : ''}`}
          >
            <button
              className="flex h-12 w-fit items-center gap-2 rounded-2xl bg-raised pr-5 pl-4 font-medium text-strong shadow-md ring-1 ring-line hover:brightness-110"
              onClick={fromSidebar(() => {
                if (!days.includes(today)) go(view, today);
                useUi.getState().setDraft(nextHourDraft());
              })}
            >
              <Plus size={20} className="text-accent" /> Create
            </button>
            <MiniMonth
              selected={date}
              range={range}
              onSelect={d => fromSidebar(() => go(view, d))()}
            />
            <Layers />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 pr-2 pb-2">
            {view === 'month' ? (
              <MonthGrid
                date={firstOfMonth(date)}
                onDayClick={d => go('day', d)}
              />
            ) : (
              <TimeGrid key={view} days={days} onDayClick={d => go('day', d)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sidebar toggles: show or hide events and each area's planned sessions (per device). */
function Layers() {
  const areas = useStore(s => s.data.areas);
  const rows = [
    {key: 'events', name: 'Events', color: 'var(--color-event)'},
    ...areas.map(a => ({key: a.id, name: a.name, color: a.color})),
  ];
  return (
    <div className="space-y-4">
      <LayerList title="My calendars" rows={rows} />
      <GoogleLayers />
    </div>
  );
}

function LayerList({
  title,
  rows,
  extra,
}: {
  title: string;
  rows: {key: string; name: string; color: string}[];
  extra?: ReactNode;
}) {
  const hidden = useUi(s => s.hidden);
  const toggle = useUi(s => s.toggleHidden);
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 px-1 text-[13px] font-medium text-strong">
        <span className="flex-1">{title}</span>
        {extra}
      </div>
      {rows.map(r => {
        const on = !hidden.includes(r.key);
        return (
          <label
            key={r.key}
            className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-raised"
          >
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2 transition-colors"
              style={{
                borderColor: r.color,
                background: on ? r.color : 'transparent',
              }}
            >
              {on && (
                <svg
                  viewBox="0 0 12 12"
                  className="h-3 w-3"
                  fill="none"
                  stroke="var(--color-on-block)"
                  strokeWidth="2"
                >
                  <path d="M2.5 6.5 5 9l4.5-5.5" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() => toggle(r.key)}
            />
            <span className="truncate">{r.name}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Google calendars chosen in Settings (read-only), with status, refresh and reconnect. */
function GoogleLayers() {
  useGoogleCalendars();
  const g = useGoogle();
  if (g.status === 'signed-out' && !g.clientId) {
    return (
      <a
        href={href({name: 'settings'})}
        className="block rounded-md px-1 py-1 text-[12px] text-accent hover:underline"
      >
        Connect Google Calendar…
      </a>
    );
  }
  if (!calendarConnected(g)) {
    return (
      <div className="px-1">
        <div className="mb-1 text-[13px] font-medium text-strong">
          Google Calendar
        </div>
        <button
          className="btn"
          onClick={() => void g.connectCalendar()}
          disabled={g.status === 'signing-in'}
        >
          {g.calendar && g.status === 'expired'
            ? 'Reconnect'
            : g.status === 'signing-in'
              ? 'Waiting…'
              : 'Connect'}
        </button>
        {g.error && <p className="mt-1 text-[11px] text-danger">{g.error}</p>}
      </div>
    );
  }
  const rows = g.calendars
    .filter(c => g.selected.includes(c.id))
    .map(c => ({
      key: `g:${c.id}`,
      name: c.summaryOverride ?? c.summary,
      color: c.backgroundColor ?? '#8ab4f8',
    }));
  return (
    <div className="space-y-2">
      <GoogleErrorNotice compact />
      <LayerList
        title="Google (read-only)"
        rows={rows}
        extra={
          <button
            className="icon-btn h-6 w-6"
            title="Refresh from Google"
            aria-label="Refresh from Google"
            onClick={clearGoogleCache}
          >
            <RefreshCw size={13} />
          </button>
        }
      />
    </div>
  );
}
