import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Plus,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {updateSession} from '../actions';
import {BufferedTextarea} from '../components/buffered';
import {MiniMonth} from '../components/mini_month';
import {CapacityLine, LIST, SectionTitle} from '../components/phone/parts';
import {DayPlanSheet, SessionSheet} from '../components/phone/plan_sheet';
import {SessionRow, ToPlanRow} from '../components/phone/rows';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import {BACKLOG_ROWS, MISSED_ROWS} from '../config';
import {fmtDuration} from '../format';
import {useCapacities, useLookups, useToday, type Lookups} from '../hooks';
import {useNavTarget} from '../keyboard';
import {plannedInWindow} from '../model/capacity';
import {
  addDays,
  dayName,
  isISODate,
  MONDAY,
  monthKey,
  monthName,
  shortDate,
  startOfWeek,
} from '../model/dates';
import {backlogItems, missedAllocations} from '../model/selectors';
import type {Allocation, ISODate} from '../model/types';
import {navigate} from '../router';
import {useStore} from '../store';

type Tab = 'week' | 'plan' | 'notes';

/**
 * The week journal on a phone: the days as a list rather than seven boxes.
 * Each day says its plan in words, an empty note is one line, missed
 * sessions move with a tap, and the tasks to plan are a tab, not under the
 * week. Everything a drag does on desktop has a button here.
 */
export function WeekPhoneView({week}: {week?: ISODate}) {
  const today = useToday();
  // Always Monday–Sunday, as on desktop.
  const start = startOfWeek(week && isISODate(week) ? week : today, MONDAY);
  const thisWeek = startOfWeek(today, MONDAY);
  const goWeek = (d: ISODate) => {
    const target = startOfWeek(d, MONDAY);
    navigate({name: 'week', week: target === thisWeek ? undefined : target});
  };
  useNavTarget({
    next: () => goWeek(addDays(start, 7)),
    prev: () => goWeek(addDays(start, -7)),
    today: () => goWeek(today),
    goTo: goWeek,
  });
  const lookups = useLookups();
  const [tab, setTab] = useState<Tab>('week');
  const [picking, setPicking] = useState(false);
  const allocations = useStore(s => s.data.allocations);
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const days = useMemo(
    () => Array.from({length: 7}, (_, i) => addDays(start, i)),
    [start],
  );
  const capacities = useCapacities(days);
  const plan = useMemo(
    () => ({items, allocations, projects}),
    [items, allocations, projects],
  );
  const missed = useMemo(() => missedAllocations(plan, today), [plan, today]);
  const backlog = useMemo(() => backlogItems(plan, today), [plan, today]);
  const byDay = useMemo(
    () =>
      new Map(
        days.map(d => [
          d,
          allocations
            .filter(a => a.date === d)
            .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99')),
        ]),
      ),
    [days, allocations],
  );
  const planned = days.reduce(
    (sum, d) => sum + plannedInWindow(byDay.get(d)!, capacities.get(d)!),
    0,
  );
  const room = days.reduce((sum, d) => sum + capacities.get(d)!.total, 0);

  return (
    <div className="h-full overflow-y-auto pb-28 text-[15px]">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-2 pt-1 pb-2 backdrop-blur">
        <div className="flex items-center">
          <button
            aria-label="Previous week"
            className="flex h-11 w-11 items-center justify-center text-dim"
            onClick={() => goWeek(addDays(start, -7))}
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger
                className="flex h-8 items-center gap-1 rounded-md px-2 text-[17px] font-semibold text-strong"
                aria-label="Pick a week"
              >
                {shortDate(start)} – {shortDate(addDays(start, 6))}
                <ChevronDown size={16} className="text-dim" aria-hidden />
              </PopoverTrigger>
              <PopoverContent align="center" className="p-3">
                <MiniMonth
                  selected={start}
                  range={[start, addDays(start, 6)]}
                  onSelect={d => {
                    goWeek(d);
                    setPicking(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <CapacityLine planned={planned} total={room} />
          </div>
          <button
            aria-label="Next week"
            className="flex h-11 w-11 items-center justify-center text-dim"
            onClick={() => goWeek(addDays(start, 7))}
          >
            <ChevronRight size={22} aria-hidden />
          </button>
        </div>
        <div
          role="tablist"
          className="mx-1 mt-2 grid grid-cols-3 rounded-full bg-raised p-1 text-[14px]"
        >
          {(
            [
              ['week', start === thisWeek ? 'This week' : 'Week'],
              ['plan', `To plan · ${backlog.length}`],
              ['notes', 'Month notes'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-10 rounded-full ${tab === t ? 'bg-panel font-semibold text-strong shadow' : 'text-dim'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'plan' && (
        <ToPlan backlog={backlog} lookups={lookups} today={today} />
      )}
      {tab === 'notes' && <MonthNote month={monthKey(addDays(start, 3))} />}
      {tab === 'week' && (
        <>
          {start !== thisWeek && (
            <button
              className="mx-3 mt-3 h-10 rounded-full border border-line px-4 text-[14px]"
              onClick={() => goWeek(today)}
            >
              Back to this week
            </button>
          )}
          <Missed missed={missed} lookups={lookups} today={today} />
          {days.map(d => (
            <Day
              key={d}
              date={d}
              isToday={d === today}
              allocs={byDay.get(d)!}
              planned={plannedInWindow(byDay.get(d)!, capacities.get(d)!)}
              total={capacities.get(d)!.total}
              lookups={lookups}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Day({
  date,
  isToday,
  allocs,
  planned,
  total,
  lookups,
}: {
  date: ISODate;
  isToday: boolean;
  allocs: Allocation[];
  planned: number;
  total: number;
  lookups: Lookups;
}) {
  const [planning, setPlanning] = useState(false);
  return (
    <section
      aria-label={`${dayName(date)} ${shortDate(date)}`}
      className="mt-4"
    >
      <div className="flex items-end px-4 pb-1">
        <h2
          className={`flex-1 text-[16px] font-semibold ${isToday ? 'text-accent' : 'text-strong'}`}
        >
          {dayName(date)} {Number(date.slice(8))}
          {isToday && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[12px] text-on-accent">
              Today
            </span>
          )}
        </h2>
        <CapacityLine planned={planned} total={total} />
      </div>
      <ul className={`${LIST} ${isToday ? '!border-accent/60' : ''}`}>
        {allocs.map(a => (
          <SessionRow key={a.id} alloc={a} lookups={lookups} />
        ))}
        <li className="flex min-h-11 items-start">
          <DayNote date={date} empty={allocs.length === 0} />
          <button
            className="flex h-11 shrink-0 items-center gap-1 px-4 text-[14px] text-accent"
            aria-label={`Plan a task for ${dayName(date)} ${shortDate(date)}`}
            onClick={() => setPlanning(true)}
          >
            <Plus size={16} aria-hidden /> plan
          </button>
        </li>
      </ul>
      {planning && (
        <DayPlanSheet day={date} onClose={() => setPlanning(false)} />
      )}
    </section>
  );
}

/** The day's note: one line while it's empty, a field once tapped. */
function DayNote({date, empty}: {date: ISODate; empty: boolean}) {
  const note = useStore(s => s.data.dayNotes[date] ?? '');
  const [editing, setEditing] = useState(false);
  if (editing || note)
    return (
      <BufferedTextarea
        autoFocus={editing}
        aria-label={`Notes for ${dayName(date)} ${shortDate(date)}`}
        rows={Math.min(6, Math.max(1, note.split('\n').length))}
        className="min-w-0 flex-1 resize-none bg-transparent px-4 py-2.5 text-[15px] placeholder:text-dim"
        placeholder="Notes for the day…"
        value={note}
        onCommit={text => {
          useStore.getState().setDayNote(date, text);
          setEditing(false);
        }}
      />
    );
  return (
    <button
      className="h-11 min-w-0 flex-1 px-4 text-left text-[14px] text-dim"
      onClick={() => setEditing(true)}
    >
      {empty ? 'Nothing planned · + note' : '+ note'}
    </button>
  );
}

function Missed({
  missed,
  lookups,
  today,
}: {
  missed: Allocation[];
  lookups: Lookups;
  today: ISODate;
}) {
  const [rows, setRows] = useState(MISSED_ROWS);
  if (!missed.length) return null;
  return (
    <section
      aria-label="Missed sessions"
      className="mx-3 mt-3 overflow-hidden rounded-xl border border-danger/40 bg-danger/5"
    >
      <h2 className="px-4 pt-2.5 text-[13px] font-semibold text-danger">
        Missed · move them to a day
      </h2>
      <ul>
        {missed.slice(0, rows).map(a => (
          <MissedRow key={a.id} alloc={a} lookups={lookups} today={today} />
        ))}
      </ul>
      <More
        rest={missed.length - rows}
        step={MISSED_ROWS}
        onMore={() => setRows(n => n + MISSED_ROWS)}
      />
    </section>
  );
}

function MissedRow({
  alloc,
  lookups,
  today,
}: {
  alloc: Allocation;
  lookups: Lookups;
  today: ISODate;
}) {
  const item = lookups.item(alloc.itemId);
  const [sheet, setSheet] = useState(false);
  if (!item) return null;
  const to = (d: ISODate, word: string) => () =>
    updateSession(alloc.id, {date: d}, `Moved “${item.title}” to ${word}`);
  const chip =
    'h-10 shrink-0 rounded-full border border-line bg-raised px-3 text-[14px] font-medium text-strong';
  return (
    <li className="flex min-h-14 items-center gap-1.5 pr-1 pl-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-strong">{item.title}</div>
        <div className="truncate text-[13px] text-dim">
          was {dayName(alloc.date)} {shortDate(alloc.date)} ·{' '}
          {fmtDuration(alloc.plannedHours)}
        </div>
      </div>
      <button className={chip} onClick={to(today, 'today')}>
        Today
      </button>
      <button className={chip} onClick={to(addDays(today, 1), 'tomorrow')}>
        Tomorrow
      </button>
      <button
        className="flex h-11 w-10 shrink-0 items-center justify-center text-dim"
        aria-label={`Another day, or remove “${item.title}”`}
        onClick={() => setSheet(true)}
      >
        <Ellipsis size={20} aria-hidden />
      </button>
      {sheet && (
        <SessionSheet
          alloc={alloc}
          item={item}
          onClose={() => setSheet(false)}
        />
      )}
    </li>
  );
}

function ToPlan({
  backlog,
  lookups,
  today,
}: {
  backlog: ReturnType<typeof backlogItems>;
  lookups: Lookups;
  today: ISODate;
}) {
  const areas = useStore(s => s.data.areas);
  const [area, setArea] = useState<string | null>(null);
  const [rows, setRows] = useState(BACKLOG_ROWS);
  const visible = area
    ? backlog.filter(b => lookups.project(b.item.projectId)?.areaId === area)
    : backlog;
  return (
    <>
      <div
        role="radiogroup"
        aria-label="Area"
        className="flex gap-2 overflow-x-auto px-3 pt-3"
      >
        {[null, ...areas].map(a => (
          <button
            key={a?.id ?? 'all'}
            role="radio"
            aria-checked={area === (a?.id ?? null)}
            onClick={() => setArea(a?.id ?? null)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] ${area === (a?.id ?? null) ? 'border-accent bg-accent/20 font-semibold text-accent' : 'border-line text-fg'}`}
          >
            {a && (
              <span
                className="h-2 w-2 rounded-full"
                style={{background: a.color}}
              />
            )}
            {a?.name ?? 'All'}
          </button>
        ))}
      </div>
      <SectionTitle>
        {visible.length} {visible.length === 1 ? 'task needs' : 'tasks need'}{' '}
        time
      </SectionTitle>
      {visible.length === 0 ? (
        <p className="px-4 text-dim">
          Nothing left to plan{area ? ' in this area' : ''}.
        </p>
      ) : (
        <ul className={LIST}>
          {visible.slice(0, rows).map(b => (
            <ToPlanRow
              key={b.item.id}
              item={b.item}
              remaining={b.remaining}
              lookups={lookups}
              today={today}
            />
          ))}
        </ul>
      )}
      <More
        rest={visible.length - rows}
        step={BACKLOG_ROWS}
        onMore={() => setRows(n => n + BACKLOG_ROWS)}
      />
    </>
  );
}

function MonthNote({month}: {month: string}) {
  const note = useStore(s => s.data.monthNotes[month] ?? '');
  return (
    <div className="px-3 pt-3">
      <BufferedTextarea
        aria-label={`Notes for ${monthName(month)}`}
        rows={14}
        className="w-full resize-none rounded-xl border border-line bg-panel px-4 py-3 text-[15px] placeholder:text-dim"
        placeholder={`Notes and goals for ${monthName(month)}…`}
        value={note}
        onCommit={text => useStore.getState().setMonthNote(month, text)}
      />
    </div>
  );
}

function More({
  rest,
  step,
  onMore,
}: {
  rest: number;
  step: number;
  onMore(): void;
}) {
  if (rest <= 0) return null;
  return (
    <button className="h-11 w-full text-[14px] text-accent" onClick={onMore}>
      Show {Math.min(step, rest)} more{rest > step ? ` (of ${rest})` : ''}
    </button>
  );
}
