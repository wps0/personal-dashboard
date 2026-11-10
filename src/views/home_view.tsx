import {HOME_CALENDAR_DEFAULT, HOME_HOUR_PX} from '../config';
import {UsosBanner} from '../components/usos_review';
import {SignInPrompt} from '../components/signin_prompt';
import {ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import {memo, useMemo, useState} from 'react';
import {create} from 'zustand';
import {MiniMonth} from '../components/mini_month';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import {ProgressRing} from '../components/progress_ring';
import {TimeGrid} from '../components/time_grid';
import {ToPlanCard} from '../components/to_plan_card';
import {Select} from '../components/ui/select';
import {WorkCard} from '../components/work_card';
import {fmtH, URGENCY_CLASS} from '../format';
import {useLookups, useToday, useWeekStart, type Lookups} from '../hooks';
import {
  addDays,
  countdown,
  dayName,
  isISODate,
  shortDate,
  startOfWeek,
  type DayOfWeek,
} from '../model/dates';
import {
  allocationsByItem,
  isItemDone,
  missedAllocations,
  projectStats,
  urgency,
} from '../model/selectors';
import type {Allocation, ISODate} from '../model/types';
import {href, navigate} from '../router';
import {useStore} from '../store';
import {useNavTarget} from '../keyboard';
import {nextHourDraft, useUi} from '../ui';
import {removeSession, toggleSession} from '../actions';
import {blockKeys} from '../keyboard';

/** What Home's calendar shows: a day, three days, or the calendar week. */
type HomeSpan = 'day' | '3day' | 'week';

const SPAN_OPTIONS = [
  {value: 'day', label: 'Day'},
  {value: '3day', label: '3 days'},
  {value: 'week', label: 'Week'},
] as const;

/** Per device, like the theme: in localStorage, not in the synced data. */
const SPAN_KEY = 'personal-dashboard/home-calendar';

function readSpan(): HomeSpan {
  try {
    const v = localStorage.getItem(SPAN_KEY);
    return (
      SPAN_OPTIONS.find(o => o.value === v)?.value ?? HOME_CALENDAR_DEFAULT
    );
  } catch {
    return HOME_CALENDAR_DEFAULT;
  }
}

const useHomeSpan = create<{span: HomeSpan; setSpan(span: HomeSpan): void}>(
  set => ({
    span: readSpan(),
    setSpan: span => {
      try {
        localStorage.setItem(SPAN_KEY, span);
      } catch {
        // Storage blocked: the choice just won't outlive the tab.
      }
      set({span});
    },
  }),
);

/** The days shown from `start`: it and the next two, or the week it's in. */
function spanDays(
  span: HomeSpan,
  start: ISODate,
  weekStart: DayOfWeek,
): ISODate[] {
  if (span === 'day') return [start];
  if (span === '3day') return [start, addDays(start, 1), addDays(start, 2)];
  const first = startOfWeek(start, weekStart);
  return Array.from({length: 7}, (_, i) => addDays(first, i));
}

/**
 * Landing page: a day, three days or the week (picked per device; from today
 * by default, ‹ › move a day at a time, or a week), what's planned on them,
 * and how projects stand.
 */
export function HomeView({date}: {date?: ISODate}) {
  const today = useToday();
  const weekStart = useWeekStart();
  const span = useHomeSpan(s => s.span);
  const start = date && isISODate(date) ? date : today;
  const days = useMemo(
    () => spanDays(span, start, weekStart),
    [span, start, weekStart],
  );
  const step = span === 'week' ? 7 : 1;
  useNavTarget({
    next: () => go(addDays(start, step), today),
    prev: () => go(addDays(start, -step), today),
    today: () => go(today, today),
    goTo: d => go(d, today),
    create: () => {
      if (!days.includes(today)) go(today, today);
      useUi.getState().setDraft(nextHourDraft());
    },
  });
  return (
    <div className="grid h-full grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
      <div className="flex h-[70vh] min-h-0 flex-col rounded-lg border border-line bg-panel lg:h-full">
        <DayNav start={start} days={days} span={span} today={today} />
        <div className="min-h-0 flex-1">
          <TimeGrid
            days={days}
            hourHeight={HOME_HOUR_PX}
            scrollToHour={Math.max(0, new Date().getHours() - 2)}
            onDayClick={d => navigate({name: 'calendar', view: 'day', date: d})}
          />
        </div>
      </div>
      {/* Below lg the page scrolls, so the cards take the room they need;
          beside the calendar (lg) they share its height. */}
      <div className="flex flex-col gap-2 lg:min-h-0">
        <SignInPrompt />
        <UsosBanner />
        <Planned days={days} />
        <ToPlanCard />
        <Projects />
        <WorkCard />
      </div>
    </div>
  );
}

function go(d: ISODate, today: ISODate) {
  navigate({name: 'home', date: d === today ? undefined : d});
}

function DayNav({
  start,
  days,
  span,
  today,
}: {
  start: ISODate;
  days: ISODate[];
  span: HomeSpan;
  today: ISODate;
}) {
  const [open, setOpen] = useState(false);
  const first = days[0];
  const end = days[days.length - 1];
  const unit = span === 'week' ? 'week' : 'day';
  const step = span === 'week' ? 7 : 1;
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
      <button
        className="btn h-7 rounded-full px-3"
        onClick={() => go(today, today)}
        // A week shows today wherever it is in it; fewer days, as the first.
        disabled={span === 'week' ? days.includes(today) : start === today}
        title="Today (t)"
      >
        Today
      </button>
      <button
        className="icon-btn"
        aria-label={`Previous ${unit}`}
        title={`Previous ${unit} (k)`}
        onClick={() => go(addDays(start, -step), today)}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="icon-btn"
        aria-label={`Next ${unit}`}
        title={`Next ${unit} (j)`}
        onClick={() => go(addDays(start, step), today)}
      >
        <ChevronRight size={18} />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-strong hover:bg-raised"
          title="Pick a date"
        >
          {first === end ? formatDay(first) : formatRange(first, end)}
          <ChevronDown size={14} className="text-dim" />
        </PopoverTrigger>
        <PopoverContent align="start" className="p-3">
          <MiniMonth
            selected={start}
            range={[first, end]}
            onSelect={d => {
              go(d, today);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <Select
        value={span}
        onChange={v => useHomeSpan.getState().setSpan(v)}
        options={SPAN_OPTIONS}
        className="ml-auto h-7 w-24 rounded-full px-3"
        ariaLabel="Days shown"
      />
    </div>
  );
}

/** "Mon, 9 Nov". */
function formatDay(d: ISODate): string {
  return `${dayName(d)}, ${shortDate(d)}`;
}

/** "10 – 12 Oct", or "30 Oct – 1 Nov". */
function formatRange(a: ISODate, b: ISODate): string {
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${Number(a.slice(8))} – ${shortDate(b)}`
    : `${shortDate(a)} – ${shortDate(b)}`;
}

/** "Today", "Tomorrow", "Yesterday", or the weekday. */
function relativeDay(d: ISODate, today: ISODate): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  if (d === addDays(today, -1)) return 'Yesterday';
  return dayName(d);
}

function Planned({days}: {days: ISODate[]}) {
  const allocations = useStore(s => s.data.allocations);
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const lookups = useLookups();
  const today = useToday();
  const missed = useMemo(
    () => missedAllocations({items, allocations, projects}, today).length,
    [items, allocations, projects, today],
  );
  const byDay = useMemo(
    () =>
      days.map(d => ({
        date: d,
        allocs: allocations
          .filter(a => a.date === d)
          .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99')),
      })),
    [allocations, days],
  );

  return (
    <section className="flex flex-col rounded border border-line bg-panel lg:max-h-[55%] lg:min-h-0">
      <header className="flex items-center border-b border-line px-2 py-1">
        <span className="label">planned</span>
        {missed > 0 && (
          <a
            href={href({name: 'week'})}
            className="ml-2 text-[11px] text-danger hover:underline"
          >
            {missed} missed →
          </a>
        )}
        <a
          href={href({name: 'week'})}
          className="btn-ghost ml-auto text-[11px]"
        >
          week view ↗
        </a>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
        {byDay.map(({date, allocs}) => (
          <div key={date} className="mb-1.5">
            <div className="flex items-baseline gap-1.5 px-1">
              <span
                className={`text-[12px] font-semibold ${date === today ? 'text-accent' : 'text-strong'}`}
              >
                {relativeDay(date, today)}
              </span>
              <span className="tabular-nums text-[11px] text-dim">
                {shortDate(date)}
              </span>
              <span className="ml-auto tabular-nums text-[11px] text-dim">
                {fmtH(allocs.reduce((s, a) => s + a.plannedHours, 0))}
              </span>
            </div>
            {allocs.length === 0 ? (
              <p className="px-1 text-[12px] text-dim/60">nothing planned</p>
            ) : (
              <ul className="space-y-px">
                {allocs.map(a => (
                  <PlannedRow key={a.id} alloc={a} lookups={lookups} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const PlannedRow = memo(function PlannedRow({
  alloc,
  lookups,
}: {
  alloc: Allocation;
  lookups: Lookups;
}) {
  const openItem = useUi(s => s.openItem);
  const item = lookups.item(alloc.itemId);
  if (!item) return null;
  return (
    <li
      tabIndex={0}
      data-block
      onKeyDown={blockKeys({
        open: () => openItem(item.id),
        toggle: () => toggleSession(alloc.id),
        remove: () => removeSession(alloc.id),
      })}
      className="flex animate-fade-in items-center gap-1.5 rounded-md border-l-2 bg-raised py-0.5 pr-1.5 pl-1.5 transition-colors duration-150 hover:bg-line/60"
      style={{borderLeftColor: lookups.color(item)}}
    >
      <input
        type="checkbox"
        className="accent-ok"
        checked={alloc.done}
        onChange={() => toggleSession(alloc.id)}
      />
      <button
        className="min-w-0 flex-1 text-left leading-tight"
        onClick={() => openItem(item.id)}
      >
        <div
          className={`truncate transition-colors duration-200 ${alloc.done ? 'text-dim' : ''}`}
        >
          {isItemDone(item) && <span className="text-ok">✓ </span>}
          <span className={`strike ${alloc.done ? 'is-struck' : ''}`}>
            {item.title}
          </span>
        </div>
        <div className="truncate text-[10px] text-dim">
          {lookups.project(item.projectId)?.name}
        </div>
      </button>
      {alloc.start && (
        <span className="tabular-nums text-[11px] text-dim">{alloc.start}</span>
      )}
      <span className="w-8 text-right tabular-nums text-[11px]">
        {fmtH(alloc.plannedHours)}
      </span>
    </li>
  );
});

function Projects() {
  const projects = useStore(s => s.data.projects);
  const items = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const lookups = useLookups();
  const today = useToday();

  // Active projects, nearest deadline first.
  const rows = useMemo(() => {
    const allocs = allocationsByItem({allocations});
    return projects
      .filter(p => !p.archived)
      .map(p => ({p, s: projectStats(p, items, allocs)}))
      .sort(
        (a, b) =>
          (a.s.next?.date ?? '9999').localeCompare(b.s.next?.date ?? '9999') ||
          a.p.name.localeCompare(b.p.name),
      );
  }, [projects, items, allocations]);

  return (
    <section className="flex flex-col rounded border border-line bg-panel lg:min-h-28 lg:flex-1">
      <header className="flex items-center border-b border-line px-2 py-1">
        <span className="label">projects</span>
        <a
          href={href({name: 'projects'})}
          className="btn-ghost ml-auto text-[11px]"
        >
          all ↗
        </a>
      </header>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
        {rows.map(({p, s}) => (
          <li key={p.id}>
            <a
              href={href({name: 'projects', id: p.id})}
              className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors duration-150 hover:bg-raised"
            >
              <ProgressRing
                percent={s.percent}
                color={lookups.area(p.areaId)?.color ?? '#94a3b8'}
                size={30}
                stroke={3}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-strong">{p.name}</div>
                <div className="truncate text-[11px] text-dim">
                  <span className="tabular-nums">
                    {s.total > 0 ? `${s.done}/${s.total}` : `${s.percent}%`}
                  </span>
                  {s.next && (
                    <span
                      className={URGENCY_CLASS[urgency(s.next.date, today)]}
                    >
                      {' '}
                      · {countdown(s.next.date, today)} · {s.next.title}
                    </span>
                  )}
                </div>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
