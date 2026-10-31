import {sameProps} from '../same_props';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {ghostUnderPointer, useDragSensors} from '../dnd';
import {ChevronLeft, ChevronRight, Redo2} from 'lucide-react';
import {memo, useCallback, useMemo, useState, type ReactNode} from 'react';
import {BufferedTextarea} from '../components/buffered';
import {HoursInput} from '../components/hours_input';
import {WeekNav} from '../components/week_nav';
import {fmtH, URGENCY_CLASS} from '../format';
import {
  useCapacities,
  useLookups,
  useSlide,
  useToday,
  type Lookups,
} from '../hooks';
import {CapacityBadge} from '../components/capacity_badge';
import {plannedInWindow, type CapacityInfo} from '../model/capacity';
import {
  addDays,
  countdown,
  dayName,
  isISODate,
  MONDAY,
  monthKey,
  monthName,
  shortDate,
  startOfWeek,
} from '../model/dates';
import {
  backlogItems,
  defaultAllocationHours,
  isItemDone,
  missedAllocations,
  urgency,
} from '../model/selectors';
import type {Allocation, ISODate, Item} from '../model/types';
import {useStore} from '../store';
import {useUi} from '../ui';
import {useNavTarget} from '../keyboard';
import {navigate} from '../router';
import {
  completeItem,
  planSession,
  removeSession,
  toggleSession,
  updateSession,
} from '../actions';
import {blockKeys} from '../keyboard';

type DragData =
  | {kind: 'item'; item: Item; remaining?: number}
  | {kind: 'alloc'; alloc: Allocation};

const NO_ALLOCS: Allocation[] = [];

/**
 * Rows the backlog and the missed tray show at first, and how many more each
 * "Show more" adds: hundreds of draggable rows are slow to draw (a second or
 * more), and the week grid redraws them when the week changes.
 */
const BACKLOG_ROWS = 60;
const MISSED_ROWS = 20;

/**
 * The drag-and-drop context lives here and must not re-render on data changes:
 * when it does, dnd-kit re-renders every draggable. Data subscriptions live in
 * the children (WeekGrid, WeekTotal) instead.
 */
export function WeekView({week}: {week?: ISODate}) {
  const today = useToday();
  // Always Monday–Sunday: the week start setting is for the calendar. The
  // route holds the Monday; any other day shows the week containing it.
  const start = startOfWeek(week && isISODate(week) ? week : today, MONDAY);
  const [dragging, setDragging] = useState<DragData | null>(null);
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

  const sensors = useDragSensors();

  const onDragStart = (e: DragStartEvent) =>
    setDragging(e.active.data.current as DragData);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const drag = e.active.data.current as DragData | undefined;
    const target = e.over?.id;
    if (!drag || typeof target !== 'string') return;
    if (target.startsWith('day:')) {
      const date = target.slice(4);
      if (drag.kind === 'item')
        planSession(drag.item.id, date, defaultAllocationHours(drag.remaining));
      else if (drag.alloc.date !== date) updateSession(drag.alloc.id, {date});
    } else if (
      target === 'backlog' &&
      drag.kind === 'alloc' &&
      !drag.alloc.done
    ) {
      removeSession(drag.alloc.id, 'Unscheduled');
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Enter opens, Space marks done, Delete removes, arrow keys move between items. Drag with the mouse or a finger to move.',
        },
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-line px-2 py-1 sm:px-3">
          <WeekNav start={start} />
          {start === thisWeek && today !== start && <RolloverToggle />}
          <WeekTotal start={start} />
        </div>
        <WeekGrid start={start} today={today} />
      </div>
      <DragOverlay dropAnimation={null} modifiers={[ghostUnderPointer]}>
        {dragging && <DragPreview drag={dragging} />}
      </DragOverlay>
    </DndContext>
  );
}

function WeekTotal({start}: {start: ISODate}) {
  const days = useMemo(
    () => Array.from({length: 7}, (_, i) => addDays(start, i)),
    [start],
  );
  const allocations = useStore(s => s.data.allocations);
  const capacities = useCapacities(days);
  const planned = days.reduce(
    (sum, d) =>
      sum +
      plannedInWindow(
        allocations.filter(a => a.date === d),
        capacities.get(d)!.window,
      ),
    0,
  );
  const capacity = [...capacities.values()].reduce(
    (sum, c) => sum + c.total,
    0,
  );
  return (
    <span
      className={`ml-auto text-[12px] whitespace-nowrap tabular-nums ${planned > capacity ? 'text-danger' : 'text-dim'}`}
      title="Planned this week / capacity"
    >
      {/* On phones as short as the day badges: "11.5h/27h". */}
      <span className="hidden sm:inline">Week: </span>
      {fmtH(planned)}
      <span className="hidden sm:inline"> planned of </span>
      <span className="sm:hidden">/</span>
      {fmtH(capacity)}
    </span>
  );
}

/** Shows next week's day in place of each day of this week that's past. */
function RolloverToggle() {
  const on = useUi(s => s.weekRollover);
  return (
    <button
      className={`btn h-8 gap-1.5 rounded-full px-3 ${on ? 'border-accent/60 bg-accent/15 text-accent' : ''}`}
      aria-pressed={on}
      onClick={() => useUi.getState().setWeekRollover(!on)}
      title="Show next week’s day in place of each day that’s past"
    >
      <Redo2 size={15} />
      <span className="hidden sm:inline">Past days: next week</span>
      <span className="sm:hidden">Roll over</span>
    </button>
  );
}

const NO_FLIPS: ReadonlySet<number> = new Set();

function WeekGrid({start, today}: {start: ISODate; today: ISODate}) {
  const allocations = useStore(s => s.data.allocations);
  const lookups = useLookups();
  const rollover = useUi(s => s.weekRollover);
  // Days flipped by hand (by weekday, 0 = Monday), relative to what the
  // rollover shows; reset on another week or when the rollover changes.
  const view = `${start}|${rollover}`;
  const [flips, setFlips] = useState({view, days: NO_FLIPS});
  const flipped = flips.view === view ? flips.days : NO_FLIPS;
  const flip = useCallback(
    (weekday: number) =>
      setFlips(f => {
        const days = new Set(f.view === view ? f.days : NO_FLIPS);
        if (!days.delete(weekday)) days.add(weekday);
        return {view, days};
      }),
    [view],
  );
  const thisWeek = startOfWeek(today, MONDAY);
  const days = useMemo(
    () =>
      Array.from({length: 7}, (_, i) => {
        const date = addDays(start, i);
        const rolled = rollover && start === thisWeek && date < today;
        return rolled !== flipped.has(i) ? addDays(date, 7) : date;
      }),
    [start, rollover, thisWeek, today, flipped],
  );
  const capacities = useCapacities(days);
  const slide = useSlide(start);

  const byDate = useMemo(() => {
    const m = new Map<ISODate, Allocation[]>();
    for (const a of allocations) {
      const list = m.get(a.date);
      if (list) list.push(a);
      else m.set(a.date, [a]);
    }
    for (const list of m.values())
      list.sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'));
    return m;
  }, [allocations]);

  const dayBox = (date: ISODate, i: number) => (
    <DayBox
      key={date}
      date={date}
      weekday={i}
      nextWeek={date > addDays(start, 6)}
      onFlip={flip}
      isToday={date === today}
      isPast={date < today}
      allocs={byDate.get(date) ?? NO_ALLOCS}
      capacity={capacities.get(date)!}
      lookups={lookups}
    />
  );

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 md:overflow-hidden">
      <div
        key={start}
        className={`grid gap-2 md:h-full md:grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)] ${slide}`}
      >
        <div className="grid gap-2 md:min-h-0 md:grid-cols-5">
          {days.slice(0, 5).map(dayBox)}
        </div>
        <div className="grid gap-2 md:min-h-0 md:grid-cols-5">
          <div className="grid gap-2 md:col-span-2 md:min-h-0 md:grid-cols-2">
            {days.slice(5).map((d, i) => dayBox(d, i + 5))}
          </div>
          <BacklogBox
            lookups={lookups}
            today={today}
            month={monthKey(addDays(start, 3))}
          />
        </div>
      </div>
    </div>
  );
}

interface DayBoxProps {
  date: ISODate;
  /** Its place in the week, 0 = Monday. */
  weekday: number;
  /** It shows next week's day in this weekday's place. */
  nextWeek: boolean;
  /** Shows this weekday in the other week. */
  onFlip(weekday: number): void;
  isToday: boolean;
  isPast: boolean;
  allocs: Allocation[];
  capacity: CapacityInfo;
  lookups: Lookups;
}

/**
 * Droppable shell; re-renders on every drag transition, so the content below is
 * memoized. Days whose sessions didn't change get equal props (sameProps), so
 * they skip re-rendering.
 */
const DayBox = memo(function DayBox(props: DayBoxProps) {
  const {setNodeRef, isOver} = useDroppable({id: `day:${props.date}`});
  return (
    <section
      ref={setNodeRef}
      className={`drop-target flex min-h-40 flex-col rounded-lg border bg-panel md:min-h-0 ${
        isOver
          ? 'is-over border-accent bg-accent/5'
          : props.isToday
            ? 'border-accent/50'
            : 'border-line'
      } ${props.isPast ? 'opacity-75' : ''} ${props.nextWeek ? 'border-dashed' : ''}`}
    >
      <DayContent {...props} />
    </section>
  );
}, sameProps);

const DayContent = memo(function DayContent({
  date,
  weekday,
  nextWeek,
  onFlip,
  isToday,
  isPast,
  allocs,
  capacity,
  lookups,
}: DayBoxProps) {
  const planned = plannedInWindow(allocs, capacity.window);
  const other = addDays(date, nextWeek ? -7 : 7);
  const flipLabel = `Show ${dayName(other)} ${shortDate(other)}${nextWeek ? '' : ' (next week)'}`;
  return (
    <>
      <header className="flex items-center gap-1.5 border-b border-line px-2 py-1">
        <span
          className={`font-semibold ${isToday ? 'text-accent' : 'text-strong'}`}
        >
          {dayName(date)}
        </span>
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums ${isToday ? 'bg-accent font-medium text-on-accent' : 'text-dim'}`}
        >
          {Number(date.slice(8))}
        </span>
        {nextWeek && (
          <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-medium text-accent">
            next week
          </span>
        )}
        <button
          className="icon-btn ml-auto h-6 w-6"
          aria-label={flipLabel}
          title={flipLabel}
          onClick={() => onFlip(weekday)}
        >
          {nextWeek ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
        <span>
          <CapacityBadge
            date={date}
            planned={planned}
            info={capacity}
            isPast={isPast}
          />
        </span>
      </header>
      {allocs.length > 0 && (
        <ul className="scroll-thin max-h-[60%] shrink-0 space-y-px overflow-y-auto p-1">
          {allocs.map(a => (
            <AllocationBlock key={a.id} alloc={a} lookups={lookups} />
          ))}
        </ul>
      )}
      <DayNote date={date} />
    </>
  );
}, sameProps);

function DayNote({date}: {date: ISODate}) {
  const note = useStore(s => s.data.dayNotes[date] ?? '');
  return (
    <BufferedTextarea
      className="scroll-thin min-h-12 w-full flex-1 resize-none px-2 py-1 text-[12px] placeholder:text-dim/40"
      placeholder="notes…"
      value={note}
      onCommit={text => useStore.getState().setDayNote(date, text)}
    />
  );
}

function stop(e: {stopPropagation(): void}) {
  e.stopPropagation();
}

/**
 * Draggable shell. dnd-kit re-renders every draggable when a drag starts or the
 * drop target changes, so the shell stays thin and the content is memoized.
 */
const AllocationBlock = memo(function AllocationBlock({
  alloc,
  lookups,
  showDate,
}: {
  alloc: Allocation;
  lookups: Lookups;
  showDate?: boolean;
}) {
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    // A missed session is rendered twice (in its day and in the overdue tray, where
    // showDate is set). Each copy needs its own drag id: with a shared id dnd-kit
    // measured whichever copy registered last, so dragging the day copy behaved as if
    // the tray copy had been grabbed (preview offset, wrong drop target).
    id: `alloc:${alloc.id}${showDate ? ':missed' : ''}`,
    data: {kind: 'alloc', alloc} satisfies DragData,
  });
  const item = lookups.item(alloc.itemId);
  if (!item) return null;
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-block
      onKeyDown={blockKeys({
        open: () => useUi.getState().openItem(item.id),
        toggle: () => toggleSession(alloc.id),
        remove: () => removeSession(alloc.id),
      })}
      className={`block-interactive group flex cursor-grab touch-none items-center gap-1.5 rounded-md border-l-2 bg-raised py-0.5 pr-1 pl-1.5 active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{borderLeftColor: lookups.color(item)}}
    >
      <AllocationContent
        alloc={alloc}
        item={item}
        projectName={lookups.project(item.projectId)?.name}
        showDate={showDate}
      />
    </li>
  );
});

const AllocationContent = memo(function AllocationContent(props: {
  alloc: Allocation;
  item: Item;
  projectName?: string;
  showDate?: boolean;
}) {
  const {alloc, item, projectName, showDate} = props;
  const openItem = useUi(s => s.openItem);
  const itemDone = isItemDone(item);
  return (
    <>
      <input
        type="checkbox"
        checked={alloc.done}
        title={
          alloc.done
            ? 'Done — uncheck to undo'
            : 'Mark this session done (logs its hours)'
        }
        onPointerDown={stop}
        onChange={() => toggleSession(alloc.id)}
        className="accent-ok"
      />
      <button
        className="min-w-0 flex-1 text-left leading-tight"
        onClick={() => openItem(item.id)}
        title="Open task details"
      >
        <div
          className={`truncate transition-colors duration-200 ${alloc.done ? 'text-dim' : ''}`}
        >
          {itemDone && <span className="text-ok">✓ </span>}
          {alloc.start && (
            <span className="tabular-nums text-[11px] text-dim">
              {alloc.start}{' '}
            </span>
          )}
          <span className={`strike ${alloc.done ? 'is-struck' : ''}`}>
            {item.title}
          </span>
        </div>
        <div className="truncate text-[10px] text-dim">
          {showDate && (
            <span className="tabular-nums text-danger">
              {dayName(alloc.date)} {shortDate(alloc.date)} ·{' '}
            </span>
          )}
          {projectName}
        </div>
      </button>
      <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        {!itemDone && (
          <button
            className="btn-ghost px-1 text-[11px]"
            title="Mark the whole task complete"
            onPointerDown={stop}
            onClick={() => completeItem(item)}
          >
            ✓✓
          </button>
        )}
        <button
          className="btn-ghost px-1 hover:text-danger"
          title="Remove from plan"
          onPointerDown={stop}
          onClick={() => removeSession(alloc.id)}
        >
          ×
        </button>
      </div>
      {alloc.done ? (
        <HoursInput
          value={alloc.actualHours ?? alloc.plannedHours}
          title={`Actual hours (planned ${alloc.plannedHours}h)`}
          onChange={h =>
            updateSession(alloc.id, {actualHours: h}, 'Hours changed')
          }
          className="text-[11px] text-ok"
        />
      ) : (
        <HoursInput
          value={alloc.plannedHours}
          title="Planned hours"
          onChange={h =>
            h
              ? updateSession(alloc.id, {plannedHours: h}, 'Hours changed')
              : removeSession(alloc.id)
          }
          className="text-[11px]"
        />
      )}
    </>
  );
});

const BacklogBox = memo(function BacklogBox(props: {
  lookups: Lookups;
  today: ISODate;
  month: string;
}) {
  const {setNodeRef, isOver} = useDroppable({id: 'backlog'});
  return (
    <section
      ref={setNodeRef}
      className={`drop-target flex min-h-64 flex-col rounded-lg border bg-panel md:col-span-3 md:min-h-0 ${isOver ? 'is-over border-accent bg-accent/5' : 'border-line'}`}
    >
      <BacklogContents {...props} />
    </section>
  );
});

const BacklogContents = memo(function BacklogContents({
  lookups,
  today,
  month,
}: {
  lookups: Lookups;
  today: ISODate;
  month: string;
}) {
  const items = useStore(s => s.data.items);
  const allocations = useStore(s => s.data.allocations);
  const projects = useStore(s => s.data.projects);
  const areas = useStore(s => s.data.areas);
  const [tab, setTab] = useState<'backlog' | 'notes'>('backlog');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [backlogRows, setBacklogRows] = useState(BACKLOG_ROWS);
  const [missedRows, setMissedRows] = useState(MISSED_ROWS);

  const {backlog, missed} = useMemo(() => {
    const slice = {items, allocations, projects};
    return {
      backlog: backlogItems(slice, today),
      missed: missedAllocations(slice, today),
    };
  }, [items, allocations, projects, today]);
  const visible = areaFilter
    ? backlog.filter(
        b => lookups.project(b.item.projectId)?.areaId === areaFilter,
      )
    : backlog;

  return (
    <>
      <header className="flex items-center gap-1 border-b border-line px-1.5 py-1">
        <Tab active={tab === 'backlog'} onClick={() => setTab('backlog')}>
          backlog <span className="text-dim/70">{backlog.length}</span>
        </Tab>
        <Tab active={tab === 'notes'} onClick={() => setTab('notes')}>
          {monthName(month)}
        </Tab>
        {tab === 'backlog' && (
          <div className="ml-auto flex gap-0.5">
            {[null, ...areas].map(a => (
              <button
                key={a?.id ?? 'all'}
                onClick={() => setAreaFilter(a?.id ?? null)}
                className={`flex items-center gap-1 rounded px-1.5 text-[11px] ${areaFilter === (a?.id ?? null) ? 'bg-raised text-fg' : 'text-dim hover:text-fg'}`}
              >
                {a && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{background: a.color}}
                  />
                )}
                {a ? a.name : 'all'}
              </button>
            ))}
          </div>
        )}
      </header>
      {tab === 'notes' ? (
        <MonthNote month={month} />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
          {missed.length > 0 && (
            <div className="mb-2 rounded border border-danger/30 bg-danger/5 p-1">
              <div className="label mb-1 px-1 !text-danger">
                missed · drag to a day to reschedule
              </div>
              <ul className="space-y-px">
                {missed.slice(0, missedRows).map(a => (
                  <AllocationBlock
                    key={a.id}
                    alloc={a}
                    lookups={lookups}
                    showDate
                  />
                ))}
              </ul>
              <ShowMore
                rest={missed.length - missedRows}
                step={MISSED_ROWS}
                onMore={() => setMissedRows(n => n + MISSED_ROWS)}
              />
            </div>
          )}
          {visible.length === 0 ? (
            <p className="p-3 text-center text-dim">
              Nothing left to schedule{areaFilter ? ' in this area' : ''}. Drop
              a block here to unschedule it.
            </p>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-px xl:grid-cols-2">
                {visible.slice(0, backlogRows).map(b => (
                  <BacklogItem
                    key={b.item.id}
                    item={b.item}
                    remaining={b.remaining}
                    lookups={lookups}
                    today={today}
                  />
                ))}
              </ul>
              <ShowMore
                rest={visible.length - backlogRows}
                step={BACKLOG_ROWS}
                onMore={() => setBacklogRows(n => n + BACKLOG_ROWS)}
              />
            </>
          )}
        </div>
      )}
    </>
  );
});

/** "Show 60 more (of 240)" under a list cut short; nothing when it isn't. */
function ShowMore({
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
    <button className="btn-ghost mt-1 w-full text-[11px]" onClick={onMore}>
      Show {Math.min(step, rest)} more{rest > step ? ` (of ${rest})` : ''}
    </button>
  );
}

function MonthNote({month}: {month: string}) {
  const note = useStore(s => s.data.monthNotes[month] ?? '');
  return (
    <BufferedTextarea
      className="scroll-thin w-full flex-1 resize-none px-2 py-1 text-[12px] placeholder:text-dim/40"
      placeholder={`Notes and goals for ${monthName(month)}…`}
      value={note}
      onCommit={text => useStore.getState().setMonthNote(month, text)}
    />
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`label rounded px-1.5 py-0.5 transition-colors duration-150 ${active ? 'bg-raised !text-fg' : 'hover:!text-fg'}`}
    >
      {children}
    </button>
  );
}

const BacklogItem = memo(function BacklogItem({
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
  const openItem = useUi(s => s.openItem);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `item:${item.id}`,
    data: {kind: 'item', item, remaining} satisfies DragData,
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-block
      onKeyDown={blockKeys({open: () => openItem(item.id)})}
      onClick={() => openItem(item.id)}
      className={`flex cursor-grab touch-none items-center gap-1.5 rounded-md border-l-2 px-1.5 py-0.5 transition-[background-color,transform] duration-150 hover:bg-raised active:scale-[0.985] active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{borderLeftColor: lookups.color(item)}}
      title="Drag onto a day to plan time · click for details"
    >
      <BacklogContent
        item={item}
        remaining={remaining}
        projectName={lookups.project(item.projectId)?.name}
        today={today}
      />
    </li>
  );
});

const BacklogContent = memo(function BacklogContent(props: {
  item: Item;
  remaining?: number;
  projectName?: string;
  today: ISODate;
}) {
  const {item, remaining, projectName, today} = props;
  return (
    <>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate">{item.title}</div>
        <div className="truncate text-[10px] text-dim">
          {projectName}
          {item.heldOn && !item.dueDate && (
            <> · held {shortDate(item.heldOn)}</>
          )}
        </div>
      </div>
      {item.dueDate && (
        <span
          className={`shrink-0 tabular-nums text-[11px] ${URGENCY_CLASS[urgency(item.dueDate, today)]}`}
        >
          {countdown(item.dueDate, today)}
        </span>
      )}
      <span
        className="w-10 shrink-0 text-right tabular-nums text-[11px] text-dim"
        title="Hours left to plan"
      >
        {remaining != null ? fmtH(remaining) : ''}
      </span>
    </>
  );
});

function DragPreview({drag}: {drag: DragData}) {
  const lookups = useLookups();
  const item =
    drag.kind === 'item' ? drag.item : lookups.item(drag.alloc.itemId);
  if (!item) return null;
  const hours =
    drag.kind === 'item'
      ? defaultAllocationHours(drag.remaining)
      : drag.alloc.plannedHours;
  return (
    <div
      className="flex w-56 animate-lift cursor-grabbing items-center gap-2 rounded-md border border-l-2 border-accent/50 bg-raised px-2 py-1 shadow-lg shadow-black/50"
      style={{borderLeftColor: lookups.color(item)}}
    >
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <span className="tabular-nums text-[11px] text-dim">{fmtH(hours)}</span>
    </div>
  );
}
