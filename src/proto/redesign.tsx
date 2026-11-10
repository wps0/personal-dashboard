/**
 * @fileoverview PROTOTYPE, not for merging: redesign proposals from
 * docs/ux_review.md, on the app's real data. Phones get a "Today" agenda
 * for Home, a compact Week, and task rows made for fingers; everything is
 * 44px to tap, 13px or larger to read, undoable from a bar that stays, and
 * planned from a sheet rather than by dragging.
 */
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Ellipsis,
  FileText,
  Flag,
  GraduationCap,
  PenLine,
  Plus,
  SquareCheck,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import {Fragment, useMemo, useState, type ReactNode} from 'react';
import {create} from 'zustand';
import {
  planSession,
  removeSession,
  toggleSession,
  updateSession,
} from '../actions';
import {WorkCard} from '../components/work_card';
import {eventStyle} from '../event_colors';
import {fmtDuration, URGENCY_CLASS} from '../format';
import {
  useCapacities,
  useLookups,
  useMediaQuery,
  useToday,
  type Lookups,
} from '../hooks';
import {plannedInWindow} from '../model/capacity';
import {
  addDays,
  countdown,
  dayName,
  shortDate,
  startOfWeek,
} from '../model/dates';
import {eventsByDay} from '../model/recurrence';
import {isReserved, reservedByDay} from '../model/reserved';
import {
  backlogItems,
  compareOpenFirst,
  defaultAllocationHours,
  isItemDone,
  missedAllocations,
  urgency,
} from '../model/selectors';
import {fromMinutes, toMinutes} from '../model/time';
import {
  ItemKind,
  ItemStatus,
  type Allocation,
  type ISODate,
  type Item,
  type Project,
} from '../model/types';
import {href, navigate} from '../router';
import {useStore} from '../store';
import {undoLast} from '../toast';
import {nextHourDraft, useUi} from '../ui';

/** Whether this is a phone: the proposals below replace its screens. */
export function usePhone(): boolean {
  return useMediaQuery('(max-width: 639px)');
}

// Undo that stays: the last change, with Undo, until the next change.

const useLast = create<{message: string | null}>(() => ({message: null}));

function did(message: string) {
  useLast.setState({message});
}

function UndoBar() {
  const message = useLast(s => s.message);
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed right-20 bottom-[calc(68px+env(safe-area-inset-bottom))] left-3 z-40 flex h-12 items-center gap-2 rounded-xl bg-strong pr-1 pl-4 text-[14px] text-bg shadow-xl"
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <button
        className="flex h-11 items-center gap-1.5 rounded-lg px-3 font-semibold"
        onClick={() => {
          undoLast();
          useLast.setState({message: null});
        }}
      >
        <Undo2 size={16} /> Undo
      </button>
    </div>
  );
}

// Shared pieces.

const KIND: Record<number, {name: string; icon: LucideIcon}> = {
  [ItemKind.CLASS]: {name: 'Class', icon: GraduationCap},
  [ItemKind.ASSIGNMENT]: {name: 'Assignment', icon: FileText},
  [ItemKind.EXAM]: {name: 'Exam', icon: PenLine},
  [ItemKind.TASK]: {name: 'Task', icon: SquareCheck},
};

/** A tick box drawn at 24px inside a 44px place to tap. */
function Tick({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(): void;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={e => {
        e.stopPropagation();
        onChange();
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors duration-150 ${checked ? 'border-ok bg-ok text-bg' : 'border-dim'}`}
      >
        {checked && <Check size={16} strokeWidth={3} />}
      </span>
    </button>
  );
}

/** "1h of 1.5h planned", with a bar: what the "1h/1.5h" badge means, said. */
function Capacity({planned, total}: {planned: number; total: number}) {
  const over = planned > total;
  return (
    <div className="flex items-center gap-2 text-[13px] text-dim">
      <span className={`tabular-nums ${over ? 'text-danger' : ''}`}>
        <span className="text-fg">{fmtDuration(planned)}</span> planned of{' '}
        {fmtDuration(total)}
      </span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-raised">
        <span
          className={`block h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`}
          style={{
            width: `${total ? Math.min(100, (planned / total) * 100) : planned ? 100 : 0}%`,
          }}
        />
      </span>
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label={title}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 animate-fade-in rounded-t-2xl border-t border-line bg-panel px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] text-[15px] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="mb-3 text-[17px] font-semibold text-strong">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mt-5 mb-1 flex items-center px-4">
      <h2 className="text-[13px] font-semibold tracking-wide text-dim uppercase">
        {children}
      </h2>
      <span className="ml-auto">{action}</span>
    </div>
  );
}

/** The free planning hours of the days from `from`, for the Plan sheet. */
function useFree(days: ISODate[]): Map<ISODate, number> {
  const allocations = useStore(s => s.data.allocations);
  const capacities = useCapacities(days);
  return useMemo(
    () =>
      new Map(
        days.map(d => {
          const c = capacities.get(d)!;
          const planned = plannedInWindow(
            allocations.filter(a => a.date === d),
            c,
          );
          return [d, Math.max(0, c.total - planned)];
        }),
      ),
    [days, allocations, capacities],
  );
}

function relDay(d: ISODate, today: ISODate): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  return `${dayName(d)} ${shortDate(d)}`;
}

const LENGTHS = [0.5, 1, 1.5, 2, 3];

/**
 * Planning without dragging: pick how long and which day; each day says how
 * much room it has. For a session already planned, it moves it.
 */
function PlanSheet({
  item,
  moving,
  onClose,
}: {
  item: Item;
  /** The session to move, instead of planning a new one. */
  moving?: Allocation;
  onClose(): void;
}) {
  const today = useToday();
  const days = useMemo(
    () => Array.from({length: 6}, (_, i) => addDays(today, i)),
    [today],
  );
  const free = useFree(days);
  const remaining = useStore(
    s =>
      backlogItems(s.data, today).find(b => b.item.id === item.id)?.remaining,
  );
  const [hours, setHours] = useState(
    moving?.plannedHours ?? defaultAllocationHours(remaining),
  );
  const pick = (d: ISODate) => {
    if (moving) updateSession(moving.id, {date: d, start: undefined});
    else planSession(item.id, d, hours);
    did(
      `${moving ? 'Moved' : 'Planned'} “${item.title}” ${d === today ? 'for today' : `for ${relDay(d, today)}`}`,
    );
    onClose();
  };
  return (
    <Sheet title={moving ? 'Move to…' : 'Plan'} onClose={onClose}>
      <p className="-mt-2 mb-3 truncate text-dim">
        {item.title}
        {remaining !== undefined && ` · ${fmtDuration(remaining)} left to plan`}
      </p>
      {!moving && (
        <div
          className="mb-3 flex gap-2"
          role="radiogroup"
          aria-label="How long"
        >
          {LENGTHS.map(h => (
            <button
              key={h}
              role="radio"
              aria-checked={h === hours}
              onClick={() => setHours(h)}
              className={`h-11 flex-1 rounded-full border text-[14px] tabular-nums ${h === hours ? 'border-accent bg-accent/20 font-semibold text-accent' : 'border-line text-fg'}`}
            >
              {fmtDuration(h)}
            </button>
          ))}
        </div>
      )}
      <ul className="-mx-2">
        {days.map(d => {
          const room = free.get(d) ?? 0;
          return (
            <li key={d}>
              <button
                onClick={() => pick(d)}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left active:bg-raised"
              >
                <CalendarPlus size={18} className="text-dim" />
                <span className="flex-1 text-strong">{relDay(d, today)}</span>
                <span
                  className={`text-[13px] tabular-nums ${room >= hours ? 'text-ok' : room > 0 ? 'text-warn' : 'text-dim'}`}
                >
                  {room > 0 ? `${fmtDuration(room)} free` : 'full'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {moving && (
        <button
          className="mt-1 h-12 w-full rounded-lg text-left text-danger active:bg-raised"
          onClick={() => {
            removeSession(moving.id);
            onClose();
          }}
        >
          Remove from the plan
        </button>
      )}
    </Sheet>
  );
}

/** A planned session: tick, title, project, length with its unit, and ⋯ to move it. */
function SessionRow({
  alloc,
  lookups,
  showTime = true,
}: {
  alloc: Allocation;
  lookups: Lookups;
  showTime?: boolean;
}) {
  const item = lookups.item(alloc.itemId);
  const [moving, setMoving] = useState(false);
  if (!item) return null;
  const project = lookups.project(item.projectId);
  const end =
    alloc.start &&
    fromMinutes(toMinutes(alloc.start) + Math.round(alloc.plannedHours * 60));
  return (
    <li
      className="flex min-h-14 items-center border-l-4 pr-1"
      style={{borderLeftColor: lookups.color(item)}}
    >
      <Tick
        checked={alloc.done}
        label={`${item.title}: done`}
        onChange={() => {
          toggleSession(alloc.id);
          did(alloc.done ? `“${item.title}” not done` : `“${item.title}” done`);
        }}
      />
      <button
        className="min-w-0 flex-1 py-1.5 text-left"
        onClick={() => useUi.getState().openItem(item.id)}
      >
        <div
          className={`truncate ${alloc.done ? 'text-dim line-through' : 'text-strong'}`}
        >
          {item.title}
        </div>
        <div className="truncate text-[13px] text-dim">
          {showTime && alloc.start && (
            <span className="text-fg tabular-nums">
              {alloc.start}–{end} ·{' '}
            </span>
          )}
          {project?.name}
        </div>
      </button>
      <span className="px-1 text-[14px] text-dim tabular-nums">
        {fmtDuration(alloc.plannedHours)}
      </span>
      <button
        className="flex h-11 w-11 items-center justify-center text-dim"
        aria-label={`Move or remove “${item.title}”`}
        onClick={() => setMoving(true)}
      >
        <Ellipsis size={20} />
      </button>
      {moving && (
        <PlanSheet
          item={item}
          moving={alloc}
          onClose={() => setMoving(false)}
        />
      )}
    </li>
  );
}

/** A task that still needs time, with Plan. */
function ToPlanRow({
  item,
  remaining,
  lookups,
  today,
}: {
  item: Item;
  remaining?: number;
  lookups: Lookups;
  today: ISODate;
}) {
  const [planning, setPlanning] = useState(false);
  const project = lookups.project(item.projectId);
  return (
    <li
      className="flex min-h-14 items-center gap-2 border-l-4 pr-3 pl-3"
      style={{borderLeftColor: lookups.color(item)}}
    >
      <button
        className="min-w-0 flex-1 py-1.5 text-left"
        onClick={() => useUi.getState().openItem(item.id)}
      >
        <div className="truncate text-strong">{item.title}</div>
        <div className="truncate text-[13px] text-dim">
          {item.dueDate && (
            <span className={URGENCY_CLASS[urgency(item.dueDate, today)]}>
              <Flag size={12} className="mr-1 inline" />
              due {countdown(item.dueDate, today)} ·{' '}
            </span>
          )}
          {remaining !== undefined && `${fmtDuration(remaining)} to plan · `}
          {project?.name}
        </div>
      </button>
      <button
        className="flex h-10 items-center gap-1 rounded-full border border-line bg-raised px-3.5 text-[14px] font-medium text-strong"
        onClick={() => setPlanning(true)}
      >
        Plan <ChevronDown size={14} />
      </button>
      {planning && <PlanSheet item={item} onClose={() => setPlanning(false)} />}
    </li>
  );
}

function Fab() {
  return (
    <button
      aria-label="New event or time block"
      className="fixed right-4 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-xl active:scale-95"
      onClick={() => {
        navigate({name: 'calendar', view: 'day'});
        useUi.getState().setDraft(nextHourDraft());
      }}
    >
      <Plus size={26} />
    </button>
  );
}

// Home on a phone: Today, as an agenda.

type Entry =
  | {kind: 'event'; at: number; end: number; title: string; color: string}
  | {kind: 'reserved'; at: number; end: number; title: string}
  | {kind: 'session'; at: number; alloc: Allocation};

/**
 * Proposal 1. Home on a phone answers "what's now, what's next, what should
 * I plan": the day as a list in time order (events, time blocks, a line for
 * now), then sessions without a time, deadlines, and the tasks to plan.
 * The grid stays on the Calendar tab.
 */
export function ProtoToday({date}: {date?: ISODate}) {
  const today = useToday();
  const day = date ?? today;
  const lookups = useLookups();
  const events = useStore(s => s.data.events);
  const allocations = useStore(s => s.data.allocations);
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const days = useMemo(() => [day], [day]);
  const strip = useMemo(() => {
    const first = startOfWeek(day, 1);
    return Array.from({length: 7}, (_, i) => addDays(first, i));
  }, [day]);
  const capacity = useCapacities(days).get(day)!;
  const mine = useMemo(
    () => allocations.filter(a => a.date === day),
    [allocations, day],
  );
  const planned = plannedInWindow(mine, capacity);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const timeline = useMemo(() => {
    const out: Entry[] = [];
    for (const e of eventsByDay(
      events.filter(x => !isReserved(x)),
      [day],
    ).get(day) ?? [])
      if (!e.allDay)
        out.push({
          kind: 'event',
          at: toMinutes(e.start),
          end: toMinutes(e.end),
          title: e.title,
          color: eventStyle(e.color).background,
        });
    for (const r of reservedByDay(events, [day]).get(day) ?? [])
      if (!r.wraps)
        out.push({
          kind: 'reserved',
          at: r.start,
          end: r.end,
          title: r.event.title || 'Reserved',
        });
    for (const a of mine)
      if (a.start)
        out.push({kind: 'session', at: toMinutes(a.start), alloc: a});
    return out.sort((a, b) => a.at - b.at);
  }, [events, mine, day]);
  const untimed = mine.filter(a => !a.start);
  const data = useMemo(
    () => ({items, allocations, projects}),
    [items, allocations, projects],
  );
  const missed = useMemo(
    () => missedAllocations(data, today).length,
    [data, today],
  );
  const backlog = useMemo(() => backlogItems(data, today), [data, today]);
  const marks = new Set(allocations.map(a => a.date));
  const isToday = day === today;
  // Where the line for now goes: before the first entry still to start.
  const next = timeline.findIndex(e => e.at > nowMin);
  const nowAt = !isToday ? -2 : next === -1 ? timeline.length : next;

  return (
    <div className="h-full overflow-y-auto pb-28 text-[15px]">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-2 pt-2 pb-2 backdrop-blur">
        <div className="flex items-center px-2">
          <div className="flex-1">
            <div className="text-[20px] font-semibold text-strong">
              {relDay(day, today)}
            </div>
            <Capacity planned={planned} total={capacity.total} />
          </div>
          {!isToday && (
            <a
              href={href({name: 'home'})}
              className="flex h-10 items-center rounded-full border border-line px-4 text-[14px]"
            >
              Today
            </a>
          )}
        </div>
        <nav aria-label="Days" className="mt-2 grid grid-cols-7">
          {strip.map(d => (
            <a
              key={d}
              href={href({name: 'home', date: d === today ? undefined : d})}
              aria-current={d === day ? 'date' : undefined}
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] text-dim"
            >
              {dayName(d).slice(0, 1)}
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] tabular-nums ${d === day ? 'bg-accent font-semibold text-on-accent' : d === today ? 'text-accent' : 'text-strong'}`}
              >
                {Number(d.slice(8))}
              </span>
              <span
                className={`h-1 w-1 rounded-full ${marks.has(d) ? 'bg-accent' : ''}`}
              />
            </a>
          ))}
        </nav>
      </div>

      {missed > 0 && isToday && (
        <a
          href={href({name: 'week'})}
          className="mx-3 mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 text-[14px]"
        >
          <span className="flex-1 text-strong">
            {missed} missed {missed === 1 ? 'session' : 'sessions'}
          </span>
          <span className="font-medium text-danger">Reschedule</span>
          <ChevronRight size={16} className="text-danger" />
        </a>
      )}

      <SectionTitle>Schedule</SectionTitle>
      <ul className="mx-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
        {timeline.length === 0 && (
          <li className="px-4 py-4 text-dim">Nothing at a set time.</li>
        )}
        {timeline.map((e, i) => {
          const line = i === nowAt;
          const past = isToday && ('end' in e ? e.end : e.at) < nowMin;
          return (
            <Fragment key={i}>
              {line && <NowLine at={nowMin} />}
              {e.kind === 'session' ? (
                <SessionRow alloc={e.alloc} lookups={lookups} />
              ) : (
                <li
                  className={`flex min-h-14 items-center gap-3 border-l-4 px-3 ${past ? 'opacity-55' : ''}`}
                  style={{
                    borderLeftColor:
                      e.kind === 'event' ? e.color : 'var(--color-line)',
                  }}
                >
                  <span className="w-[5.5rem] shrink-0 text-[13px] text-fg tabular-nums">
                    {fromMinutes(e.at)}–{fromMinutes(e.end)}
                  </span>
                  <span
                    className={`truncate ${e.kind === 'event' ? 'text-strong' : 'text-dim italic'}`}
                  >
                    {e.title}
                  </span>
                </li>
              )}
            </Fragment>
          );
        })}
        {nowAt === timeline.length && <NowLine at={nowMin} />}
      </ul>

      {untimed.length > 0 && (
        <>
          <SectionTitle>Any time {isToday ? 'today' : 'that day'}</SectionTitle>
          <ul className="mx-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
            {untimed.map(a => (
              <SessionRow key={a.id} alloc={a} lookups={lookups} />
            ))}
          </ul>
        </>
      )}

      <SectionTitle
        action={
          <a href={href({name: 'week'})} className="text-[13px] text-accent">
            all {backlog.length}
          </a>
        }
      >
        To plan
      </SectionTitle>
      <ul className="mx-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
        {backlog.slice(0, 3).map(b => (
          <ToPlanRow
            key={b.item.id}
            item={b.item}
            remaining={b.remaining}
            lookups={lookups}
            today={today}
          />
        ))}
      </ul>

      <SectionTitle>Work</SectionTitle>
      <div className="mx-3 [&_section]:rounded-xl [&_section]:text-[14px] [&_.label]:hidden [&_header]:hidden">
        <WorkCard />
      </div>
      <Fab />
      <UndoBar />
    </div>
  );
}

function NowLine({at}: {at: number}) {
  return (
    <li
      aria-label={`Now, ${fromMinutes(at)}`}
      className="flex h-6 items-center gap-2 bg-danger/10 px-3 text-[12px] font-semibold text-danger"
    >
      <span className="h-2 w-2 rounded-full bg-danger" />
      Now · {fromMinutes(at)}
      <span className="h-px flex-1 bg-danger/50" />
    </li>
  );
}

// Week on a phone.

/**
 * Proposal 2. The week as a compact list: each day says its plan in words
 * and a bar, empty notes are one line, missed sessions move with one tap,
 * and the tasks to plan are a tab away, not below seven boxes.
 */
export function ProtoWeek({week}: {week?: ISODate}) {
  const today = useToday();
  const start = startOfWeek(week ?? today, 1);
  const lookups = useLookups();
  const [tab, setTab] = useState<'week' | 'plan'>('week');
  const allocations = useStore(s => s.data.allocations);
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const notes = useStore(s => s.data.dayNotes);
  const days = useMemo(
    () => Array.from({length: 7}, (_, i) => addDays(start, i)),
    [start],
  );
  const capacities = useCapacities(days);
  const data = useMemo(
    () => ({items, allocations, projects}),
    [items, allocations, projects],
  );
  const missed = useMemo(() => missedAllocations(data, today), [data, today]);
  const backlog = useMemo(() => backlogItems(data, today), [data, today]);
  const total = days.reduce(
    (s, d) =>
      s +
      plannedInWindow(
        allocations.filter(a => a.date === d),
        capacities.get(d)!,
      ),
    0,
  );
  const room = days.reduce((s, d) => s + capacities.get(d)!.total, 0);
  return (
    <div className="h-full overflow-y-auto pb-28 text-[15px]">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/95 px-3 pt-2 pb-2 backdrop-blur">
        <div className="flex items-center">
          <a
            aria-label="Previous week"
            href={href({name: 'week', week: addDays(start, -7)})}
            className="flex h-11 w-11 items-center justify-center text-dim"
          >
            <ChevronLeft size={22} />
          </a>
          <div className="flex-1 text-center">
            <div className="text-[17px] font-semibold text-strong">
              {shortDate(start)} – {shortDate(addDays(start, 6))}
            </div>
            <div className="flex justify-center">
              <Capacity planned={total} total={room} />
            </div>
          </div>
          <a
            aria-label="Next week"
            href={href({name: 'week', week: addDays(start, 7)})}
            className="flex h-11 w-11 items-center justify-center text-dim"
          >
            <ChevronRight size={22} />
          </a>
        </div>
        <div
          role="tablist"
          className="mt-2 grid grid-cols-2 rounded-full bg-raised p-1 text-[14px]"
        >
          {(
            [
              ['week', 'This week'],
              ['plan', `To plan · ${backlog.length}`],
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

      {tab === 'plan' ? (
        <ul className="mx-3 mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {backlog.map(b => (
            <ToPlanRow
              key={b.item.id}
              item={b.item}
              remaining={b.remaining}
              lookups={lookups}
              today={today}
            />
          ))}
        </ul>
      ) : (
        <>
          {missed.length > 0 && (
            <section className="mx-3 mt-3 overflow-hidden rounded-xl border border-danger/40 bg-danger/5">
              <h2 className="px-4 pt-2.5 text-[13px] font-semibold text-danger">
                Missed · move them to a day
              </h2>
              <ul>
                {missed.slice(0, 3).map(a => (
                  <MissedRow
                    key={a.id}
                    alloc={a}
                    lookups={lookups}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          )}
          {days.map(d => {
            const list = allocations
              .filter(a => a.date === d)
              .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'));
            const c = capacities.get(d)!;
            const isToday = d === today;
            return (
              <section key={d} className="mt-4">
                <div className="flex items-end px-4 pb-1">
                  <h2
                    className={`flex-1 text-[16px] font-semibold ${isToday ? 'text-accent' : 'text-strong'}`}
                  >
                    {dayName(d)} {Number(d.slice(8))}
                    {isToday && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[12px] text-on-accent">
                        Today
                      </span>
                    )}
                  </h2>
                  <Capacity
                    planned={plannedInWindow(list, c)}
                    total={c.total}
                  />
                </div>
                <ul
                  className={`mx-3 divide-y divide-line overflow-hidden rounded-xl border bg-panel ${isToday ? 'border-accent/60' : 'border-line'}`}
                >
                  {list.map(a => (
                    <SessionRow key={a.id} alloc={a} lookups={lookups} />
                  ))}
                  <li className="flex min-h-11 items-center px-4 text-[14px]">
                    {notes[d] ? (
                      <span className="py-2 whitespace-pre-wrap text-fg">
                        {notes[d]}
                      </span>
                    ) : (
                      <span className="text-dim">
                        {list.length ? '+ note' : 'Nothing planned · + note'}
                      </span>
                    )}
                    <button
                      className="ml-auto flex h-11 items-center gap-1 pl-3 text-accent"
                      onClick={() => setTab('plan')}
                    >
                      <Plus size={16} /> plan a task
                    </button>
                  </li>
                </ul>
              </section>
            );
          })}
        </>
      )}
      <UndoBar />
    </div>
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
  if (!item) return null;
  const to = (d: ISODate, word: string) => () => {
    updateSession(alloc.id, {date: d, start: undefined});
    did(`Moved “${item.title}” to ${word}`);
  };
  return (
    <li className="flex min-h-14 items-center gap-2 px-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-strong">{item.title}</div>
        <div className="text-[13px] text-dim">
          was {dayName(alloc.date)} {shortDate(alloc.date)} ·{' '}
          {fmtDuration(alloc.plannedHours)}
        </div>
      </div>
      <button
        className="h-10 rounded-full border border-line bg-raised px-3.5 text-[14px] font-medium text-strong"
        onClick={to(today, 'today')}
      >
        Today
      </button>
      <button
        className="h-10 rounded-full border border-line bg-raised px-3.5 text-[14px] font-medium text-strong"
        onClick={to(addDays(today, 1), 'tomorrow')}
      >
        Tomorrow
      </button>
    </li>
  );
}

// A project's tasks on a phone.

const NEXT_STATUS: Record<number, ItemStatus> = {
  [ItemStatus.TODO]: ItemStatus.DOING,
  [ItemStatus.DOING]: ItemStatus.DONE,
  [ItemStatus.DONE]: ItemStatus.TODO,
};

/** One tap moves a task on: to do → in progress → done. */
function StatusButton({item}: {item: Item}) {
  const doing = item.status === ItemStatus.DOING;
  const done = isItemDone(item);
  const label = done ? 'Done' : doing ? 'In progress' : 'To do';
  return (
    <button
      aria-label={`${label}: tap to change`}
      className="flex h-12 w-12 shrink-0 items-center justify-center"
      onClick={e => {
        e.stopPropagation();
        const next = NEXT_STATUS[item.status] ?? ItemStatus.TODO;
        useStore.getState().updateItem(item.id, {status: next});
      }}
    >
      {done ? (
        <CircleCheck size={26} className="text-ok" />
      ) : (
        <span
          className={`h-6 w-6 rounded-full border-2 ${doing ? 'border-accent' : 'border-dim'}`}
          style={
            doing
              ? {
                  background:
                    'conic-gradient(var(--color-accent) 0 50%, transparent 50%)',
                }
              : undefined
          }
        />
      )}
    </button>
  );
}

function TaskRow({
  item,
  spent,
  today,
}: {
  item: Item;
  spent: number;
  today: ISODate;
}) {
  const kind = KIND[item.kind];
  const done = isItemDone(item);
  return (
    <li className="flex min-h-14 items-center pr-3">
      <StatusButton item={item} />
      <button
        className="min-w-0 flex-1 py-2 text-left"
        onClick={() => useUi.getState().openItem(item.id)}
      >
        <div
          className={`truncate ${done ? 'text-dim line-through' : 'text-strong'}`}
        >
          {item.title}
        </div>
        <div className="flex items-center gap-1 truncate text-[13px] text-dim">
          {kind && (
            <>
              <kind.icon size={13} /> {kind.name}
            </>
          )}
          {item.dueDate && !done && (
            <span className={URGENCY_CLASS[urgency(item.dueDate, today)]}>
              · <Flag size={12} className="inline" /> due{' '}
              {countdown(item.dueDate, today)}
            </span>
          )}
          {!item.dueDate && item.heldOn && (
            <span>· held {shortDate(item.heldOn)}</span>
          )}
          {item.estimateHours != null && (
            <span className="tabular-nums">
              · {fmtDuration(spent)} of {fmtDuration(item.estimateHours)}
            </span>
          )}
        </div>
      </button>
      <ChevronRight size={18} className="shrink-0 text-dim" />
    </li>
  );
}

/**
 * Proposal 3. A project's tasks for fingers: one tap opens a task, the
 * status is a button that moves it on, kinds are words, due dates say "due",
 * hours have units, done tasks fold away, and adding needs only a title.
 */
export function ProtoItems({project}: {project: Project}) {
  const today = useToday();
  const allItems = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const items = useMemo(
    () =>
      allItems.filter(i => i.projectId === project.id).sort(compareOpenFirst),
    [allItems, project.id],
  );
  const spent = (id: string) =>
    allocations
      .filter(a => a.itemId === id && a.done)
      .reduce((s, a) => s + (a.actualHours ?? a.plannedHours), 0);
  const open = items.filter(i => !isItemDone(i));
  const done = items.filter(isItemDone);
  const add = () => {
    if (!title.trim()) return;
    useStore
      .getState()
      .addItems(project.id, [{kind: ItemKind.TASK, title: title.trim()}]);
    setTitle('');
  };
  return (
    <div className="h-full overflow-y-auto pb-24 text-[15px]">
      <div className="sticky top-0 z-10 flex gap-2 border-b border-line bg-bg px-3 py-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add a task…"
          aria-label="New task"
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-4 text-[16px] placeholder:text-dim"
        />
        <button
          aria-label="Add"
          onClick={add}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <Plus size={22} />
        </button>
      </div>
      <ul className="divide-y divide-line">
        {open.map(i => (
          <TaskRow key={i.id} item={i} spent={spent(i.id)} today={today} />
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <button
            className="flex h-12 w-full items-center gap-2 border-y border-line bg-panel px-4 text-[14px] text-dim"
            aria-expanded={showDone}
            onClick={() => setShowDone(s => !s)}
          >
            <ChevronDown size={16} className={showDone ? '' : '-rotate-90'} />
            Done · {done.length}
          </button>
          {showDone && (
            <ul className="divide-y divide-line">
              {done.map(i => (
                <TaskRow
                  key={i.id}
                  item={i}
                  spent={spent(i.id)}
                  today={today}
                />
              ))}
            </ul>
          )}
        </>
      )}
      <UndoBar />
    </div>
  );
}

// Desktop: what to plan, on Home.

/**
 * Proposal 4. Home on desktop gets the tasks that still need time, each with
 * Plan ▾ (Today, Tomorrow, the days after, with the room each has), so
 * planning doesn't need the Week page or a drag.
 */
export function ToPlanCard() {
  const today = useToday();
  const lookups = useLookups();
  const items = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const projects = useStore(s => s.data.projects);
  const backlog = useMemo(
    () => backlogItems({items, allocations, projects}, today),
    [items, allocations, projects, today],
  );
  const [open, setOpen] = useState<string | null>(null);
  const days = useMemo(
    () => Array.from({length: 5}, (_, i) => addDays(today, i)),
    [today],
  );
  const free = useFree(days);
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded border border-line bg-panel">
      <header className="flex items-center border-b border-line px-2 py-1">
        <ClipboardList size={13} className="mr-1.5 text-dim" />
        <span className="label">to plan</span>
        <span className="ml-1.5 text-[11px] text-dim">{backlog.length}</span>
        <a
          href={href({name: 'week'})}
          className="btn-ghost ml-auto text-[11px]"
        >
          all ↗
        </a>
      </header>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
        {backlog.slice(0, 8).map(({item, remaining}) => (
          <li
            key={item.id}
            className="mb-px rounded border-l-2 bg-raised/60"
            style={{borderLeftColor: lookups.color(item)}}
          >
            <div className="flex items-center gap-2 px-2 py-1">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => useUi.getState().openItem(item.id)}
              >
                <div className="truncate text-strong">{item.title}</div>
                <div className="truncate text-[11px] text-dim">
                  {item.dueDate && (
                    <span
                      className={URGENCY_CLASS[urgency(item.dueDate, today)]}
                    >
                      due {countdown(item.dueDate, today)} ·{' '}
                    </span>
                  )}
                  {remaining !== undefined &&
                    `${fmtDuration(remaining)} to plan · `}
                  {lookups.project(item.projectId)?.name}
                </div>
              </button>
              <button
                className="btn h-6 gap-1 px-2 text-[12px]"
                aria-expanded={open === item.id}
                onClick={() => setOpen(o => (o === item.id ? null : item.id))}
              >
                Plan <ChevronDown size={12} />
              </button>
            </div>
            {open === item.id && (
              <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                {days.map(d => {
                  const room = free.get(d) ?? 0;
                  const h = defaultAllocationHours(remaining);
                  return (
                    <button
                      key={d}
                      className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] hover:border-accent"
                      onClick={() => {
                        planSession(item.id, d, h);
                        setOpen(null);
                      }}
                    >
                      <span className="text-strong">{relDay(d, today)}</span>{' '}
                      <span
                        className={
                          room >= h
                            ? 'text-ok'
                            : room
                              ? 'text-warn'
                              : 'text-dim'
                        }
                      >
                        {room ? `${fmtDuration(room)} free` : 'full'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
