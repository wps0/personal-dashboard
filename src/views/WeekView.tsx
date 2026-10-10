import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { BufferedTextarea } from '../components/Buffered';
import { HoursInput } from '../components/HoursInput';
import { WeekNav } from '../components/WeekNav';
import { fmtH, URGENCY_CLASS } from '../format';
import { useCapacities, useLookups, useSlide, type Lookups } from '../hooks';
import { CapacityBadge } from '../components/CapacityBadge';
import type { CapacityInfo } from '../model/capacity';
import { addDays, countdown, dayName, monthKey, monthName, shortDate, startOfWeek, todayISO } from '../model/dates';
import { backlogItems, defaultAllocationHours, isItemDone, missedAllocations, plannedHours, urgency } from '../model/selectors';
import type { Allocation, ISODate, Item } from '../model/types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { withUndo } from '../toast';

type DragData = { kind: 'item'; item: Item; remaining?: number } | { kind: 'alloc'; alloc: Allocation };

const NO_ALLOCS: Allocation[] = [];

/**
 * The drag-and-drop context lives here and must not re-render on data changes:
 * when it does, dnd-kit re-renders every draggable. Data subscriptions live in
 * the children (WeekGrid, WeekTotal) instead.
 */
export function WeekView({ week }: { week?: ISODate }) {
  const today = todayISO();
  const monday = startOfWeek(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const [dragging, setDragging] = useState<DragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const onDragStart = (e: DragStartEvent) => setDragging(e.active.data.current as DragData);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const drag = e.active.data.current as DragData | undefined;
    const target = e.over?.id;
    if (!drag || typeof target !== 'string') return;
    const { addAllocation, updateAllocation, deleteAllocation } = useStore.getState();
    if (target.startsWith('day:')) {
      const date = target.slice(4);
      if (drag.kind === 'item') addAllocation(drag.item.id, date, defaultAllocationHours(drag.remaining));
      else if (drag.alloc.date !== date) updateAllocation(drag.alloc.id, { date });
    } else if (target === 'backlog' && drag.kind === 'alloc' && !drag.alloc.done) {
      withUndo('Unscheduled', () => deleteAllocation(drag.alloc.id));
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1">
          <WeekNav monday={monday} />
          <WeekTotal monday={monday} />
        </div>
        <WeekGrid monday={monday} today={today} />
      </div>
      <DragOverlay dropAnimation={null}>{dragging && <DragPreview drag={dragging} />}</DragOverlay>
    </DndContext>
  );
}

function WeekTotal({ monday }: { monday: ISODate }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const planned = useStore((s) => {
    const end = days[6];
    return s.data.allocations.reduce((sum, a) => (a.date >= monday && a.date <= end ? sum + a.plannedHours : sum), 0);
  });
  const capacities = useCapacities(days);
  const capacity = [...capacities.values()].reduce((sum, c) => sum + c.total, 0);
  return (
    <span className={`ml-auto text-[12px] tabular-nums ${planned > capacity ? 'text-danger' : 'text-dim'}`}>
      Week: {fmtH(planned)} planned of {fmtH(capacity)}
    </span>
  );
}

function WeekGrid({ monday, today }: { monday: ISODate; today: ISODate }) {
  const allocations = useStore((s) => s.data.allocations);
  const lookups = useLookups();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const capacities = useCapacities(days);
  const slide = useSlide(monday);

  // Days whose sessions didn't change keep the same array, so their memoized boxes skip re-rendering.
  const prevByDate = useRef(new Map<ISODate, Allocation[]>());
  const byDate = useMemo(() => {
    const m = new Map<ISODate, Allocation[]>();
    for (const a of allocations) {
      const list = m.get(a.date);
      if (list) list.push(a);
      else m.set(a.date, [a]);
    }
    for (const [date, list] of m) {
      list.sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'));
      const prev = prevByDate.current.get(date);
      if (prev && prev.length === list.length && prev.every((a, i) => a === list[i])) m.set(date, prev);
    }
    prevByDate.current = m;
    return m;
  }, [allocations]);

  const dayBox = (date: ISODate) => (
    <DayBox
      key={date}
      date={date}
      isToday={date === today}
      isPast={date < today}
      allocs={byDate.get(date) ?? NO_ALLOCS}
      capacity={capacities.get(date)!}
      lookups={lookups}
    />
  );

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 md:overflow-hidden">
      <div key={monday} className={`grid gap-2 md:h-full md:grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)] ${slide}`}>
        <div className="grid gap-2 md:min-h-0 md:grid-cols-5">{days.slice(0, 5).map(dayBox)}</div>
        <div className="grid gap-2 md:min-h-0 md:grid-cols-5">
          <div className="grid gap-2 md:col-span-2 md:min-h-0 md:grid-cols-2">{days.slice(5).map(dayBox)}</div>
          <BacklogBox lookups={lookups} today={today} month={monthKey(addDays(monday, 3))} />
        </div>
      </div>
    </div>
  );
}

interface DayBoxProps {
  date: ISODate;
  isToday: boolean;
  isPast: boolean;
  allocs: Allocation[];
  capacity: CapacityInfo;
  lookups: Lookups;
}

/** Droppable shell; re-renders on every drag transition, so the content below is memoized. */
const DayBox = memo(function DayBox(props: DayBoxProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${props.date}` });
  return (
    <section
      ref={setNodeRef}
      className={`drop-target flex min-h-40 flex-col rounded-lg border bg-panel md:min-h-0 ${
        isOver ? 'is-over border-accent bg-accent/5' : props.isToday ? 'border-accent/50' : 'border-line'
      } ${props.isPast ? 'opacity-75' : ''}`}
    >
      <DayContent {...props} />
    </section>
  );
});

const DayContent = memo(function DayContent({ date, isToday, isPast, allocs, capacity, lookups }: DayBoxProps) {
  const planned = plannedHours(allocs);
  return (
    <>
      <header className="flex items-center gap-1.5 border-b border-line px-2 py-1">
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-strong'}`}>{dayName(date)}</span>
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums ${isToday ? 'bg-accent font-medium text-white' : 'text-dim'}`}
        >
          {Number(date.slice(8))}
        </span>
        <span className="ml-auto">
          <CapacityBadge date={date} planned={planned} info={capacity} isPast={isPast} />
        </span>
      </header>
      {allocs.length > 0 && (
        <ul className="scroll-thin max-h-[60%] shrink-0 space-y-px overflow-y-auto p-1">
          {allocs.map((a) => (
            <AllocationBlock key={a.id} alloc={a} lookups={lookups} />
          ))}
        </ul>
      )}
      <DayNote date={date} />
    </>
  );
});

function DayNote({ date }: { date: ISODate }) {
  const note = useStore((s) => s.data.dayNotes[date] ?? '');
  return (
    <BufferedTextarea
      className="scroll-thin min-h-12 w-full flex-1 resize-none px-2 py-1 text-[12px] placeholder:text-dim/40"
      placeholder="notes…"
      value={note}
      onCommit={(text) => useStore.getState().setDayNote(date, text)}
    />
  );
}

const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

/**
 * Draggable shell. dnd-kit re-renders every draggable when a drag starts or the
 * drop target changes, so the shell stays thin and the content is memoized.
 */
const AllocationBlock = memo(function AllocationBlock({ alloc, lookups, showDate }: { alloc: Allocation; lookups: Lookups; showDate?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `alloc:${alloc.id}`,
    data: { kind: 'alloc', alloc } satisfies DragData,
  });
  const item = lookups.item(alloc.itemId);
  if (!item) return null;
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`block-interactive group flex cursor-grab touch-none items-center gap-1.5 rounded-md border-l-2 bg-raised py-0.5 pr-1 pl-1.5 active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ borderLeftColor: lookups.color(item) }}
    >
      <AllocationContent alloc={alloc} item={item} projectName={lookups.project(item.projectId)?.name} showDate={showDate} />
    </li>
  );
});

const AllocationContent = memo(function AllocationContent(props: { alloc: Allocation; item: Item; projectName?: string; showDate?: boolean }) {
  const { alloc, item, projectName, showDate } = props;
  const openItem = useUi((s) => s.openItem);
  const { toggleAllocation, updateAllocation, deleteAllocation, updateItem } = useStore.getState();
  const itemDone = isItemDone(item);
  return (
    <>
      <input
        type="checkbox"
        checked={alloc.done}
        title={alloc.done ? 'Done — uncheck to undo' : 'Mark this session done (logs its hours)'}
        onPointerDown={stop}
        onChange={() => toggleAllocation(alloc.id)}
        className="accent-ok"
      />
      <button className="min-w-0 flex-1 text-left leading-tight" onClick={() => openItem(item.id)} title="Open task details">
        <div className={`truncate transition-colors duration-200 ${alloc.done ? 'text-dim' : ''}`}>
          {itemDone && <span className="text-ok">✓ </span>}
          {alloc.start && <span className="tabular-nums text-[11px] text-dim">{alloc.start} </span>}
          <span className={`strike ${alloc.done ? 'is-struck' : ''}`}>{item.title}</span>
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
            onClick={() => withUndo(`Completed “${item.title}”`, () => updateItem(item.id, { status: 'done' }))}
          >
            ✓✓
          </button>
        )}
        <button className="btn-ghost px-1 hover:text-danger" title="Remove from plan" onPointerDown={stop} onClick={() => withUndo('Removed from plan', () => deleteAllocation(alloc.id))}>
          ×
        </button>
      </div>
      {alloc.done ? (
        <HoursInput
          value={alloc.actualHours ?? alloc.plannedHours}
          title={`Actual hours (planned ${alloc.plannedHours}h)`}
          onChange={(h) => updateAllocation(alloc.id, { actualHours: h })}
          className="text-[11px] text-ok"
        />
      ) : (
        <HoursInput
          value={alloc.plannedHours}
          title="Planned hours"
          onChange={(h) => (h ? updateAllocation(alloc.id, { plannedHours: h }) : deleteAllocation(alloc.id))}
          className="text-[11px]"
        />
      )}
    </>
  );
});

const BacklogBox = memo(function BacklogBox(props: { lookups: Lookups; today: ISODate; month: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog' });
  return (
    <section
      ref={setNodeRef}
      className={`drop-target flex min-h-64 flex-col rounded-lg border bg-panel md:col-span-3 md:min-h-0 ${isOver ? 'is-over border-accent bg-accent/5' : 'border-line'}`}
    >
      <BacklogContents {...props} />
    </section>
  );
});

const BacklogContents = memo(function BacklogContents({ lookups, today, month }: { lookups: Lookups; today: ISODate; month: string }) {
  const items = useStore((s) => s.data.items);
  const allocations = useStore((s) => s.data.allocations);
  const projects = useStore((s) => s.data.projects);
  const areas = useStore((s) => s.data.areas);
  const [tab, setTab] = useState<'backlog' | 'notes'>('backlog');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);

  const { backlog, missed } = useMemo(() => {
    const slice = { items, allocations, projects };
    return { backlog: backlogItems(slice, today), missed: missedAllocations(slice, today) };
  }, [items, allocations, projects, today]);
  const visible = areaFilter ? backlog.filter((b) => lookups.project(b.item.projectId)?.areaId === areaFilter) : backlog;

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
            {[null, ...areas].map((a) => (
              <button
                key={a?.id ?? 'all'}
                onClick={() => setAreaFilter(a?.id ?? null)}
                className={`flex items-center gap-1 rounded px-1.5 text-[11px] ${areaFilter === (a?.id ?? null) ? 'bg-raised text-fg' : 'text-dim hover:text-fg'}`}
              >
                {a && <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />}
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
              <div className="label mb-1 px-1 !text-danger">missed · drag to a day to reschedule</div>
              <ul className="space-y-px">
                {missed.map((a) => (
                  <AllocationBlock key={a.id} alloc={a} lookups={lookups} showDate />
                ))}
              </ul>
            </div>
          )}
          {visible.length === 0 ? (
            <p className="p-3 text-center text-dim">
              Nothing left to schedule{areaFilter ? ' in this area' : ''}. Drop a block here to unschedule it.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-px xl:grid-cols-2">
              {visible.map((b) => (
                <BacklogItem key={b.item.id} item={b.item} remaining={b.remaining} lookups={lookups} today={today} />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
});

function MonthNote({ month }: { month: string }) {
  const note = useStore((s) => s.data.monthNotes[month] ?? '');
  return (
    <BufferedTextarea
      className="scroll-thin w-full flex-1 resize-none px-2 py-1 text-[12px] placeholder:text-dim/40"
      placeholder={`Notes and goals for ${monthName(month)}…`}
      value={note}
      onCommit={(text) => useStore.getState().setMonthNote(month, text)}
    />
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`label rounded px-1.5 py-0.5 transition-colors duration-150 ${active ? 'bg-raised !text-fg' : 'hover:!text-fg'}`}>
      {children}
    </button>
  );
}

const BacklogItem = memo(function BacklogItem({ item, remaining, lookups, today }: { item: Item; remaining?: number; lookups: Lookups; today: ISODate }) {
  const openItem = useUi((s) => s.openItem);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { kind: 'item', item, remaining } satisfies DragData,
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => openItem(item.id)}
      className={`flex cursor-grab touch-none items-center gap-1.5 rounded-md border-l-2 px-1.5 py-0.5 transition-[background-color,transform] duration-150 hover:bg-raised active:scale-[0.985] active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ borderLeftColor: lookups.color(item) }}
      title="Drag onto a day to plan time · click for details"
    >
      <BacklogContent item={item} remaining={remaining} projectName={lookups.project(item.projectId)?.name} today={today} />
    </li>
  );
});

const BacklogContent = memo(function BacklogContent(props: { item: Item; remaining?: number; projectName?: string; today: ISODate }) {
  const { item, remaining, projectName, today } = props;
  return (
    <>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate">{item.title}</div>
        <div className="truncate text-[10px] text-dim">
          {projectName}
          {item.heldOn && !item.dueDate && <> · held {shortDate(item.heldOn)}</>}
        </div>
      </div>
      {item.dueDate && (
        <span className={`shrink-0 tabular-nums text-[11px] ${URGENCY_CLASS[urgency(item.dueDate, today)]}`}>{countdown(item.dueDate, today)}</span>
      )}
      <span className="w-10 shrink-0 text-right tabular-nums text-[11px] text-dim" title="Hours left to plan">
        {remaining != null ? fmtH(remaining) : ''}
      </span>
    </>
  );
});

function DragPreview({ drag }: { drag: DragData }) {
  const lookups = useLookups();
  const item = drag.kind === 'item' ? drag.item : lookups.item(drag.alloc.itemId);
  if (!item) return null;
  const hours = drag.kind === 'item' ? defaultAllocationHours(drag.remaining) : drag.alloc.plannedHours;
  return (
    <div
      className="flex w-56 animate-lift cursor-grabbing items-center gap-2 rounded-md border border-l-2 border-accent/50 bg-raised px-2 py-1 shadow-lg shadow-black/50"
      style={{ borderLeftColor: lookups.color(item) }}
    >
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <span className="tabular-nums text-[11px] text-dim">{fmtH(hours)}</span>
    </div>
  );
}
