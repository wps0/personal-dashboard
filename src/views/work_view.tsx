import {ChevronLeft, ChevronRight, Plus, X} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {
  deleteWorkSpan,
  logAsPlanned,
  logWork,
  setWeekTarget,
  updateWorkSpan,
} from '../actions';
import {HoursInput} from '../components/hours_input';
import {TimeSelect} from '../components/time_select';
import {fmtDuration, fmtHours} from '../format';
import {useToday} from '../hooks';
import {useNavTarget} from '../keyboard';
import {
  addDays,
  dayName,
  isISODate,
  MONDAY,
  monthKey,
  monthName,
  shortDate,
  startOfWeek,
  weekNumber,
} from '../model/dates';
import {fromMinutes, toMinutes} from '../model/time';
import type {ISODate, WorkSpan} from '../model/types';
import {
  loggedHours,
  plannedWork,
  spanHours,
  spansOn,
  weekHours,
  weekTarget,
} from '../model/work';
import {useStore} from '../store';

/** Weeks shown around the one in focus when the page opens or jumps. */
const BEFORE = 8;
const AFTER = 4;
/** Weeks added at a time, scrolling near the top or the bottom. */
const MORE = 8;
/** The height of the sticky toolbar (`h-12`), above the week headings. */
const TOOLBAR_PX = 48;

interface WeekRange {
  first: ISODate;
  last: ISODate;
  /** The week to bring to the top once it's rendered. */
  target?: ISODate;
}

function around(monday: ISODate): WeekRange {
  return {
    first: addDays(monday, -7 * BEFORE),
    last: addDays(monday, 7 * AFTER),
    target: monday,
  };
}

/**
 * The work log (SPEC 3.10): weeks, Monday to Sunday, in one scrolling list
 * that opens on this week and grows both ways as it's scrolled. Each day
 * shows what was worked next to what was planned (reserved time labelled
 * as work), and each week its total against its target.
 */
export function WorkView({week}: {week?: ISODate}) {
  const today = useToday();
  const thisWeek = startOfWeek(today, MONDAY);
  const focus = startOfWeek(week && isISODate(week) ? week : today, MONDAY);
  const [range, setRange] = useState(() => around(focus));
  // A link to another week (the route changed) jumps there.
  const [opened, setOpened] = useState(focus);
  if (opened !== focus) {
    setOpened(focus);
    setRange(around(focus));
  }
  const scroller = useRef<HTMLDivElement>(null);
  // The week at the top and where it starts, kept there when the list
  // changes size: weeks added above it, a resize or a turned phone.
  const anchor = useRef<WeekAtTop | null>(null);
  const growing = useRef(false);

  /** Brings `monday`'s week to the top, if it's rendered. */
  const place = useCallback((monday: ISODate): boolean => {
    const s = scroller.current;
    const el = s?.querySelector<HTMLElement>(`[data-week="${monday}"]`);
    if (!s || !el) return false;
    s.scrollTop +=
      el.getBoundingClientRect().top -
      s.getBoundingClientRect().top -
      TOOLBAR_PX;
    anchor.current = weekAtTop(s);
    return true;
  }, []);
  const show = useCallback(
    (d: ISODate) => {
      const monday = startOfWeek(d, MONDAY);
      if (!place(monday)) setRange(around(monday));
    },
    [place],
  );
  /** The week at the top of the view, under the toolbar. */
  const inView = (): ISODate => weekAtTop(scroller.current)?.week ?? focus;

  useLayoutEffect(() => {
    growing.current = false;
    if (range.target) place(range.target);
  }, [range, place]);
  useEffect(() => {
    const s = scroller.current;
    const list = s?.firstElementChild;
    if (!s || !list) return;
    const keep = new ResizeObserver(() => {
      const was = anchor.current;
      const now = was && weekAtTop(s, was.week);
      if (was && now) s.scrollTop += now.top - was.top;
    });
    keep.observe(s);
    keep.observe(list);
    return () => keep.disconnect();
  }, []);

  const onScroll = () => {
    const s = scroller.current;
    if (!s) return;
    anchor.current = weekAtTop(s);
    if (growing.current) return;
    if (s.scrollTop < s.clientHeight) {
      growing.current = true;
      setRange(r => ({first: addDays(r.first, -7 * MORE), last: r.last}));
    } else if (s.scrollHeight - s.scrollTop - s.clientHeight < s.clientHeight) {
      growing.current = true;
      setRange(r => ({first: r.first, last: addDays(r.last, 7 * MORE)}));
    }
  };

  useNavTarget({
    next: () => show(addDays(inView(), 7)),
    prev: () => show(addDays(inView(), -7)),
    today: () => show(today),
    goTo: show,
  });

  const weeks: ISODate[] = [];
  for (let m = range.first; m <= range.last; m = addDays(m, 7)) weeks.push(m);

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="scroll-thin h-full overflow-y-auto"
    >
      <div className="mx-auto max-w-3xl px-3 pb-3 sm:px-5 sm:pb-5">
        <div className="sticky top-0 z-20 flex h-12 items-center gap-1 bg-bg">
          <h1 className="mr-2 text-lg font-medium text-strong">Work</h1>
          <button
            className="btn h-8 rounded-full px-4"
            onClick={() => show(today)}
            title="This week (t)"
          >
            This week
          </button>
          <button
            className="icon-btn"
            aria-label="Previous week"
            title="Previous week (k)"
            onClick={() => show(addDays(inView(), -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-btn"
            aria-label="Next week"
            title="Next week (j)"
            onClick={() => show(addDays(inView(), 7))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {weeks.map(m => (
          <WorkWeek key={m} monday={m} today={today} current={m === thisWeek} />
        ))}
      </div>
    </div>
  );
}

interface WeekAtTop {
  week: ISODate;
  /** Where its section starts, from the top of the view. */
  top: number;
}

/**
 * The week at the top of `scroller`'s view, under the toolbar, or `week`
 * wherever it is.
 */
function weekAtTop(
  scroller: HTMLElement | null,
  week?: ISODate,
): WeekAtTop | null {
  if (!scroller) return null;
  const top = scroller.getBoundingClientRect().top;
  for (const el of scroller.querySelectorAll<HTMLElement>('[data-week]')) {
    const r = el.getBoundingClientRect();
    if (week ? el.dataset.week === week : r.bottom > top + TOOLBAR_PX + 4)
      return {week: el.dataset.week!, top: r.top - top};
  }
  return null;
}

/** One week: its heading, its total against its target, and its days. */
const WorkWeek = memo(function WorkWeek({
  monday,
  today,
  current,
}: {
  monday: ISODate;
  today: ISODate;
  current: boolean;
}) {
  const sunday = addDays(monday, 6);
  const spans = useStore(
    useShallow(s =>
      s.data.workLog.filter(w => w.date >= monday && w.date <= sunday),
    ),
  );
  const events = useStore(s => s.data.events);
  const label = useStore(s => s.data.settings.workLabel);
  const days = useMemo(
    () => Array.from({length: 7}, (_, i) => addDays(monday, i)),
    [monday],
  );
  const planned = useMemo(
    () => days.map(d => plannedWork(events, d, label)),
    [days, events, label],
  );
  const heading = `W${weekNumber(monday)} · ${shortDate(monday)} – ${shortDate(sunday)}`;
  return (
    <section data-week={monday} aria-label={heading} className="pt-3">
      <h2 className="sticky top-12 z-10 flex items-baseline gap-2 bg-bg py-1.5 tabular-nums">
        <span className={current ? 'font-medium text-accent' : 'text-strong'}>
          {heading}
        </span>
        {current && <span className="text-[12px] text-accent">This week</span>}
      </h2>
      <WeekSummary monday={monday} days={days} />
      <ul className="mt-3">
        {days.map((d, i) => (
          <WorkDay
            key={d}
            date={d}
            isToday={d === today}
            spans={spansOn(spans, d)}
            planned={planned[i]}
          />
        ))}
      </ul>
    </section>
  );
});

/** The week's hours against its target, the target itself, and month totals. */
function WeekSummary({monday, days}: {monday: ISODate; days: ISODate[]}) {
  const logged = useStore(s => weekHours(s.data.workLog, monday));
  const target = useStore(s => weekTarget(s.data.settings, monday));
  const own = useStore(
    s => s.data.settings.weekWorkTargets[monday] !== undefined,
  );
  const workTarget = useStore(s => s.data.settings.workTarget);
  const months = useStore(s =>
    [...new Set(days.map(monthKey))]
      .map(
        m =>
          `${monthName(m)}: ${fmtHours(loggedHours(s.data.workLog, `${m}-01`, `${m}-31`))}`,
      )
      .join(' · '),
  );
  const balance = logged - target;
  return (
    <section
      aria-label="Week's total"
      className="rounded-lg border border-line bg-panel p-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl text-strong tabular-nums">
          {fmtHours(logged)}
        </span>
        <span className="text-dim">
          logged{target > 0 && ` of ${fmtHours(target)}`}
        </span>
        {target > 0 && (
          <span
            className={`ml-auto tabular-nums ${balance >= 0 ? 'text-accent' : 'text-dim'}`}
          >
            {balance >= 0
              ? `${fmtHours(balance)} over`
              : `${fmtHours(-balance)} to go`}
          </span>
        )}
      </div>
      {target > 0 && (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-label="Logged of the weekly target"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={logged}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{width: `${Math.min(100, (logged / target) * 100)}%`}}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">
        <label className="flex items-center gap-1">
          Week's target
          <HoursInput
            value={target}
            onChange={h => setWeekTarget(monday, h ?? 0)}
            className="field w-14"
          />
          h
        </label>
        {own ? (
          <button
            className="text-accent hover:underline"
            onClick={() => setWeekTarget(monday, null)}
          >
            Use the default ({fmtHours(workTarget)})
          </button>
        ) : (
          <span>the default, set in Settings</span>
        )}
        <span className="ml-auto">{months}</span>
      </div>
    </section>
  );
}

/** One day: what was planned, the stretches logged, and the day's total. */
function WorkDay({
  date,
  isToday,
  spans,
  planned,
}: {
  date: ISODate;
  isToday: boolean;
  spans: WorkSpan[];
  planned: {start: string; end: string}[];
}) {
  const total = spans.reduce((sum, s) => sum + spanHours(s), 0);
  const label = `${dayName(date)} ${shortDate(date)}`;
  const add = () => {
    // After the last stretch, or the planned work, or a usual day.
    const last = spans.at(-1);
    if (last) {
      const start = toMinutes(last.end);
      if (start >= 24 * 60 - 15) return;
      logWork(date, last.end, fromMinutes(Math.min(start + 60, 24 * 60 - 1)));
    } else if (planned[0]) logWork(date, planned[0].start, planned[0].end);
    else logWork(date, '09:00', '17:00');
  };
  return (
    <li
      aria-label={label}
      className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-2.5"
    >
      <div className="w-28 shrink-0">
        <div className={isToday ? 'font-medium text-accent' : 'text-strong'}>
          {label}
        </div>
        <div className="text-[11px] text-dim">
          {planned.length
            ? `Planned ${planned.map(p => `${p.start}–${p.end}`).join(', ')}`
            : 'Nothing planned'}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {spans.map(s => (
          <SpanRow key={s.id} span={s} day={label} />
        ))}
        <div className="flex items-center gap-1">
          {!spans.length && planned.length > 0 && (
            <button className="btn h-7" onClick={() => logAsPlanned(date)}>
              Log as planned
            </button>
          )}
          <button
            className="btn-ghost flex items-center gap-1"
            onClick={add}
            aria-label={`Add a stretch, ${label}`}
          >
            <Plus size={13} /> add
          </button>
        </div>
      </div>
      <div className="w-14 shrink-0 pt-0.5 text-right tabular-nums text-strong">
        {total ? fmtHours(total) : <span className="text-dim">–</span>}
      </div>
    </li>
  );
}

function SpanRow({span, day}: {span: WorkSpan; day: string}) {
  return (
    <div className="flex items-center gap-1">
      <TimeSelect
        value={span.start}
        onChange={start => {
          // Keep the end after the start.
          const end =
            toMinutes(span.end) > toMinutes(start)
              ? span.end
              : fromMinutes(Math.min(toMinutes(start) + 60, 24 * 60 - 1));
          updateWorkSpan(span.id, {start, end});
        }}
        variant="ghost"
        className="w-fit"
        ariaLabel={`Start, ${day}`}
      />
      <span className="text-dim">–</span>
      <TimeSelect
        value={span.end}
        after={span.start}
        onChange={end => updateWorkSpan(span.id, {end})}
        variant="ghost"
        className="w-fit"
        ariaLabel={`End, ${day}`}
      />
      <span className="text-[11px] text-dim tabular-nums">
        {fmtDuration(spanHours(span))}
      </span>
      <button
        className="icon-btn h-6 w-6 hover:!text-danger"
        aria-label={`Remove ${span.start} – ${span.end}, ${day}`}
        title="Remove"
        onClick={() => deleteWorkSpan(span)}
      >
        <X size={13} />
      </button>
    </div>
  );
}
