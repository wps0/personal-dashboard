import {
  LOG_HOURS_DEFAULT,
  LOG_HOURS_MORE,
  WORK_WEEKS_AFTER,
  WORK_WEEKS_BEFORE,
  WORK_WEEKS_MORE,
} from '../config';
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
  logHours,
  logWork,
  setWeekTarget,
  updateWorkSpan,
} from '../actions';
import {DurationInput} from '../components/duration_input';
import {HoursInput} from '../components/hours_input';
import {TimeSelect} from '../components/time_select';
import {WorkBar} from '../components/work_bar';
import {fmtDuration, fmtHours, fmtWorkSpan} from '../format';
import {useToday, useWeekStart} from '../hooks';
import {useNavTarget} from '../keyboard';
import {
  addDays,
  dayName,
  isISODate,
  monthKey,
  monthName,
  shortDate,
  startOfWeek,
  weekNumber,
} from '../model/dates';
import {fromMinutes, toMinutes} from '../model/time';
import type {ISODate, WorkSpan} from '../model/types';
import {
  isHoursOnly,
  loggedHours,
  plannedWork,
  spanHours,
  spansOn,
  targetKey,
  weekHours,
  weekPlannedHours,
  weekTarget,
} from '../model/work';
import {useStore} from '../store';

/** The height of the sticky toolbar (`h-12`), above the week headings. */
const TOOLBAR_PX = 48;

interface WeekRange {
  first: ISODate;
  last: ISODate;
  /** The week to bring to the top once it's rendered. */
  target?: ISODate;
}

function around(start: ISODate): WeekRange {
  return {
    first: addDays(start, -7 * WORK_WEEKS_BEFORE),
    last: addDays(start, 7 * WORK_WEEKS_AFTER),
    target: start,
  };
}

/**
 * The work log (SPEC 3.10): weeks, from the day set in Settings → Calendar
 * (like the calendar), in one scrolling list
 * that opens on this week and grows both ways as it's scrolled. Each day
 * shows what was worked next to what was planned (reserved time labelled
 * as work), and each week its total against its target.
 */
export function WorkView({week}: {week?: ISODate}) {
  const today = useToday();
  // Weeks start on the day set in Settings → Calendar, as in the calendar.
  const weekStart = useWeekStart();
  const thisWeek = startOfWeek(today, weekStart);
  const focus = startOfWeek(week && isISODate(week) ? week : today, weekStart);
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

  /** Brings `start`'s week to the top, if it's rendered. */
  const place = useCallback((start: ISODate): boolean => {
    const s = scroller.current;
    const el = s?.querySelector<HTMLElement>(`[data-week="${start}"]`);
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
      const start = startOfWeek(d, weekStart);
      if (!place(start)) setRange(around(start));
    },
    [place, weekStart],
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
      setRange(r => ({
        first: addDays(r.first, -7 * WORK_WEEKS_MORE),
        last: r.last,
      }));
    } else if (s.scrollHeight - s.scrollTop - s.clientHeight < s.clientHeight) {
      growing.current = true;
      setRange(r => ({
        first: r.first,
        last: addDays(r.last, 7 * WORK_WEEKS_MORE),
      }));
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
          <WorkWeek key={m} start={m} today={today} current={m === thisWeek} />
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
  start,
  today,
  current,
}: {
  start: ISODate;
  today: ISODate;
  current: boolean;
}) {
  const end = addDays(start, 6);
  const spans = useStore(
    useShallow(s =>
      s.data.workLog.filter(w => w.date >= start && w.date <= end),
    ),
  );
  const events = useStore(s => s.data.events);
  const label = useStore(s => s.data.settings.workLabel);
  const days = useMemo(
    () => Array.from({length: 7}, (_, i) => addDays(start, i)),
    [start],
  );
  const planned = useMemo(
    () => days.map(d => plannedWork(events, d, label)),
    [days, events, label],
  );
  const heading = `W${weekNumber(start)} · ${shortDate(start)} – ${shortDate(end)}`;
  return (
    <section data-week={start} aria-label={heading} className="pt-3">
      <h2 className="sticky top-12 z-10 flex items-baseline gap-2 bg-bg py-1.5 tabular-nums">
        <span className={current ? 'font-medium text-accent' : 'text-strong'}>
          {heading}
        </span>
        {current && <span className="text-[12px] text-accent">This week</span>}
      </h2>
      <WeekSummary start={start} days={days} />
      <ul className="mt-3">
        {days.map((d, i) => (
          <WorkDay
            key={d}
            date={d}
            isToday={d === today}
            future={d > today}
            spans={spansOn(spans, d)}
            planned={planned[i]}
          />
        ))}
      </ul>
    </section>
  );
});

/**
 * The week's hours against its target (and the planned hours not logged
 * yet), the target itself, and month totals.
 */
function WeekSummary({start, days}: {start: ISODate; days: ISODate[]}) {
  const logged = useStore(s => weekHours(s.data.workLog, start));
  const planned = useStore(s =>
    weekPlannedHours(
      s.data.workLog,
      s.data.events,
      start,
      s.data.settings.workLabel,
    ),
  );
  const target = useStore(s => weekTarget(s.data.settings, start));
  const own = useStore(
    s => s.data.settings.weekWorkTargets[targetKey(start)] !== undefined,
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
        {planned > 0 && (
          <span className="flex items-center gap-1 self-center text-dim tabular-nums">
            <span className="planned h-2.5 w-3.5 rounded-sm" aria-hidden />
            {fmtHours(planned)} planned
          </span>
        )}
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
        <WorkBar
          logged={logged}
          planned={planned}
          target={target}
          label="Logged of the weekly target"
          className="mt-2 h-2"
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">
        <label className="flex items-center gap-1">
          Week's target
          <HoursInput
            value={target}
            onChange={h => setWeekTarget(start, h ?? 0)}
            className="field w-14"
          />
          h
        </label>
        {own ? (
          <button
            className="text-accent hover:underline"
            onClick={() => setWeekTarget(start, null)}
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

/**
 * One day: what was planned, what was logged (stretches with a start and end,
 * or hours alone), and the day's total.
 */
function WorkDay({
  date,
  isToday,
  future,
  spans,
  planned,
}: {
  date: ISODate;
  isToday: boolean;
  /** After today: nothing to log as planned yet. */
  future: boolean;
  spans: WorkSpan[];
  planned: {start: string; end: string}[];
}) {
  const total = spans.reduce((sum, s) => sum + spanHours(s), 0);
  const plan = planned.reduce((sum, p) => sum + spanHours(p), 0);
  const label = `${dayName(date)} ${shortDate(date)}`;
  // Hours just added, to type over.
  const [fresh, setFresh] = useState<string | null>(null);
  const add = () => {
    // After the last stretch, or the planned work, or a usual day.
    const last = spans.filter(s => !isHoursOnly(s)).at(-1);
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
      {/* Phones: the day and its total on one line, the buttons below. */}
      <div className="w-28 shrink-0 max-sm:flex-1">
        <div className={isToday ? 'font-medium text-accent' : 'text-strong'}>
          {label}
        </div>
        <div className="text-[11px] text-dim">
          {planned.length
            ? `Planned ${planned.map(p => `${p.start}–${p.end}`).join(', ')}`
            : 'Nothing planned'}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 max-sm:order-last max-sm:basis-full">
        {spans.map(s =>
          isHoursOnly(s) ? (
            <HoursRow key={s.id} span={s} day={label} focus={s.id === fresh} />
          ) : (
            <SpanRow key={s.id} span={s} day={label} />
          ),
        )}
        <div className="flex flex-wrap items-center gap-1 whitespace-nowrap">
          {!spans.length && planned.length > 0 && !future && (
            <button className="btn h-7" onClick={() => logAsPlanned(date)}>
              Log as planned
            </button>
          )}
          <button
            className="btn-ghost flex items-center gap-1"
            onClick={add}
            aria-label={`Add a time slot, ${label}`}
          >
            <Plus size={13} /> time slot
          </button>
          <button
            className="btn-ghost flex items-center gap-1"
            onClick={() =>
              // The day's plan, or a usual day; an hour beside other entries.
              setFresh(
                logHours(
                  date,
                  spans.length ? LOG_HOURS_MORE : plan || LOG_HOURS_DEFAULT,
                ),
              )
            }
            aria-label={`Add hours, ${label}`}
            title="Log hours without a time of day"
          >
            <Plus size={13} /> hours
          </button>
        </div>
      </div>
      <div className="w-14 shrink-0 pt-0.5 text-right tabular-nums text-strong">
        {total ? (
          fmtHours(total)
        ) : plan ? (
          <span
            className="inline-flex items-center gap-1 text-dim"
            title="Planned, not logged yet"
          >
            <span className="planned h-2.5 w-2.5 rounded-sm" aria-hidden />
            {fmtHours(plan)}
          </span>
        ) : (
          <span className="text-dim">–</span>
        )}
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
      <RemoveSpan span={span} day={day} />
    </div>
  );
}

/** Hours logged alone, without a time of day. */
function HoursRow({
  span,
  day,
  focus,
}: {
  span: WorkSpan & {hours: number};
  day: string;
  focus: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <DurationInput
        value={span.hours}
        onChange={hours => updateWorkSpan(span.id, {hours})}
        autoFocus={focus}
        ariaLabel={`Hours, ${day}`}
        title="Hours worked, without a time of day"
        className="w-16"
      />
      <span className="text-[11px] text-dim">no time slot</span>
      <RemoveSpan span={span} day={day} />
    </div>
  );
}

function RemoveSpan({span, day}: {span: WorkSpan; day: string}) {
  return (
    <button
      className="icon-btn h-6 w-6 hover:!text-danger"
      aria-label={`Remove ${fmtWorkSpan(span)}, ${day}`}
      title="Remove"
      onClick={() => deleteWorkSpan(span)}
    >
      <X size={13} />
    </button>
  );
}
