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
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { fmtH } from '../format';
import { FALLBACK_COLOR, useLookups, type Lookups } from '../hooks';
import { dayName, shortDate, todayISO, weekdayIndex } from '../model/dates';
import { isItemDone } from '../model/selectors';
import { fromMinutes, layoutSpans, snap, toMinutes } from '../model/time';
import type { Allocation, CalendarEvent, ISODate } from '../model/types';
import { useStore } from '../store';
import { useUi } from '../ui';

interface Props {
  days: ISODate[];
  /** Pixel height of one hour. */
  hourHeight?: number;
  /** Hour to scroll to initially. */
  scrollToHour?: number;
}

type Drag = { kind: 'alloc'; alloc: Allocation } | { kind: 'event'; event: CalendarEvent };

const EMPTY: never[] = [];

/** Browsers may fire a click on the common ancestor after a drag; ignore it. */
let suppressClickUntil = 0;
const endDrag = () => (suppressClickUntil = performance.now() + 200);

/**
 * Day columns with an hour grid. Shows calendar events and planned task
 * sessions that have a start time; sessions without one sit in a strip above
 * the grid and can be dragged onto it.
 */
export function TimeGrid({ days, hourHeight = 44, scrollToHour = 7 }: Props) {
  // Like WeekView: the DndContext owner must not subscribe to data, or every
  // data change re-renders all draggables. GridBody holds the subscriptions.
  const grab = useRef(0);
  const [dragging, setDragging] = useState<Drag | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  // Track the real pointer position: dnd-kit's delta mixes in scroll compensation
  // that doesn't match the time grid's own scroll container.
  const pointerY = useRef(0);
  const trackPointer = (ev: PointerEvent | TouchEvent) => (pointerY.current = clientY(ev));

  const onDragStart = (e: DragStartEvent) => {
    setDragging(e.active.data.current as Drag);
    pointerY.current = clientY(e.activatorEvent);
    window.addEventListener('pointermove', trackPointer);
    window.addEventListener('touchmove', trackPointer);
    // Where inside the block it was grabbed (dnd-kit hasn't measured the node yet at this point).
    const node = (e.activatorEvent?.target as Element | null)?.closest('[aria-roledescription="draggable"]');
    grab.current = node ? pointerY.current - node.getBoundingClientRect().top : 0;
  };

  const stopTracking = () => {
    window.removeEventListener('pointermove', trackPointer);
    window.removeEventListener('touchmove', trackPointer);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    endDrag();
    stopTracking();
    const drag = e.active.data.current as Drag | undefined;
    const target = e.over?.id;
    if (!drag || typeof target !== 'string') return;
    const [zone, date] = target.split('|');
    const { updateAllocation, updateEvent } = useStore.getState();

    if (zone === 'strip') {
      if (drag.kind === 'alloc') updateAllocation(drag.alloc.id, { date, start: undefined });
      return;
    }
    // Block top = pointer position minus where inside the block it was grabbed.
    const col = document.querySelector(`[data-col="${date}"]`);
    if (!col) return;
    const top = pointerY.current - grab.current - col.getBoundingClientRect().top;
    const start = Math.max(0, Math.min(24 * 60 - 15, snap((top / hourHeight) * 60)));
    if (drag.kind === 'alloc') {
      updateAllocation(drag.alloc.id, { date, start: fromMinutes(start) });
    } else {
      const len = toMinutes(drag.event.end) - toMinutes(drag.event.start);
      updateEvent(drag.event.id, { date, start: fromMinutes(start), end: fromMinutes(Math.min(start + len, 24 * 60 - 1)) });
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => (setDragging(null), endDrag(), stopTracking())}>
      <GridBody days={days} hourHeight={hourHeight} scrollToHour={scrollToHour} />
      <DragOverlay dropAnimation={null}>{dragging && <DragGhost drag={dragging} />}</DragOverlay>
    </DndContext>
  );
}

type DayData = { timed: Allocation[]; untimed: Allocation[]; events: CalendarEvent[] };

/** Reuses the previous arrays for days whose contents didn't change, so memoized columns skip re-rendering. */
function sameItems<T>(a: T[] | undefined, b: T[]): a is T[] {
  return !!a && a.length === b.length && a.every((x, i) => x === b[i]);
}

function GridBody({ days, hourHeight, scrollToHour }: Required<Props>) {
  const allocations = useStore((s) => s.data.allocations);
  const events = useStore((s) => s.data.events);
  const capacity = useStore((s) => s.data.settings.capacity);
  const lookups = useLookups();
  const today = todayISO();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prev = useRef(new Map<ISODate, DayData>());

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollToHour * hourHeight });
  }, [scrollToHour, hourHeight]);

  const byDay = useMemo(() => {
    const want = new Set(days);
    const m = new Map<ISODate, DayData>();
    for (const d of days) m.set(d, { timed: [], untimed: [], events: [] });
    for (const a of allocations) if (want.has(a.date)) (a.start ? m.get(a.date)!.timed : m.get(a.date)!.untimed).push(a);
    for (const e of events) if (want.has(e.date)) m.get(e.date)!.events.push(e);
    for (const [d, day] of m) {
      const p = prev.current.get(d);
      if (!p) continue;
      if (sameItems(p.timed, day.timed)) day.timed = p.timed;
      if (sameItems(p.untimed, day.untimed)) day.untimed = p.untimed;
      if (sameItems(p.events, day.events)) day.events = p.events;
    }
    prev.current = m;
    return m;
  }, [allocations, events, days]);

  const cols = `3rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-line bg-panel">
      <div className="grid shrink-0 border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const day = byDay.get(d)!;
          const planned = [...day.timed, ...day.untimed].reduce((s, a) => s + a.plannedHours, 0);
          const cap = capacity[weekdayIndex(d)];
          return (
            <div key={d} className="border-l border-line px-2 py-1">
              <div className="flex items-baseline gap-1.5">
                <span className={`font-semibold ${d === today ? 'text-accent' : 'text-strong'}`}>{dayName(d)}</span>
                <span className="font-mono text-[11px] text-dim">{shortDate(d)}</span>
                <span className={`ml-auto font-mono text-[11px] ${planned > cap ? 'text-danger' : 'text-dim'}`}>
                  {fmtH(planned)}/{fmtH(cap)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid shrink-0 border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div className="label self-center pr-1 text-right text-[9px]" title="Planned without a start time — drag onto the grid">
          todo
        </div>
        {days.map((d) => (
          <Strip key={d} date={d} allocs={byDay.get(d)!.untimed} lookups={lookups} />
        ))}
      </div>
      <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * hourHeight }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-dim" style={{ top: h * hourHeight }}>
                {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const day = byDay.get(d)!;
            return (
              <Column
                key={d}
                date={d}
                isToday={d === today}
                timed={day.timed.length ? day.timed : EMPTY}
                events={day.events.length ? day.events : EMPTY}
                hourHeight={hourHeight}
                lookups={lookups}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function clientY(e: Event | null): number {
  if (!e) return 0;
  if ('touches' in e) return (e as TouchEvent).touches[0]?.clientY ?? 0;
  return (e as PointerEvent).clientY;
}

const Strip = memo(function Strip({ date, allocs, lookups }: { date: ISODate; allocs: Allocation[]; lookups: Lookups }) {
  const { setNodeRef, isOver } = useDroppable({ id: `strip|${date}` });
  return (
    <div ref={setNodeRef} className={`scroll-thin max-h-24 min-h-7 space-y-px overflow-y-auto border-l border-line p-0.5 ${isOver ? 'bg-accent/10' : ''}`}>
      {allocs.map((a) => (
        <StripChip key={a.id} alloc={a} lookups={lookups} />
      ))}
    </div>
  );
});

const StripChip = memo(function StripChip({ alloc, lookups }: { alloc: Allocation; lookups: Lookups }) {
  const openItem = useUi((s) => s.openItem);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `alloc:${alloc.id}`, data: { kind: 'alloc', alloc } satisfies Drag });
  const item = lookups.item(alloc.itemId);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => openItem(alloc.itemId)}
      className={`flex cursor-grab touch-none items-center gap-1 truncate rounded border-l-2 bg-raised px-1 text-[11px] ${isDragging ? 'opacity-30' : ''} ${alloc.done ? 'text-dim line-through' : ''}`}
      style={{ borderLeftColor: lookups.color(item) }}
    >
      <span className="min-w-0 flex-1 truncate">{item?.title}</span>
      <span className="font-mono text-dim">{fmtH(alloc.plannedHours)}</span>
    </div>
  );
});

interface ColumnProps {
  date: ISODate;
  isToday: boolean;
  timed: Allocation[];
  events: CalendarEvent[];
  hourHeight: number;
  lookups: Lookups;
}

const Column = memo(function Column({ date, isToday, timed, events, hourHeight, lookups }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col|${date}` });
  const setOpenEvent = useUi((s) => s.setOpenEvent);

  const layout = useMemo(
    () =>
      layoutSpans([
        ...events.map((e) => ({ id: e.id, start: toMinutes(e.start), end: toMinutes(e.end) })),
        ...timed.map((a) => ({ id: a.id, start: toMinutes(a.start!), end: toMinutes(a.start!) + a.plannedHours * 60 })),
      ]),
    [events, timed],
  );

  // Click on empty grid → new event at that time.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || performance.now() < suppressClickUntil) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const start = Math.floor(((y / hourHeight) * 60) / 30) * 30;
    setOpenEvent({ draft: { title: '', date, start: fromMinutes(start), end: fromMinutes(start + 60) } });
  };

  return (
    <div
      ref={setNodeRef}
      data-col={date}
      onClick={onClick}
      className={`relative border-l border-line ${isOver ? 'bg-accent/5' : isToday ? 'bg-accent/[0.03]' : ''}`}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0 1px, transparent 1px ${hourHeight}px)`,
      }}
    >
      {events.map((e) => (
        <Block key={e.id} kind="event" event={e} pos={layout.get(e.id)} hourHeight={hourHeight} lookups={lookups} />
      ))}
      {timed.map((a) => (
        <Block key={a.id} kind="alloc" alloc={a} pos={layout.get(a.id)} hourHeight={hourHeight} lookups={lookups} />
      ))}
      {isToday && <NowLine hourHeight={hourHeight} />}
    </div>
  );
});

function NowLine({ hourHeight }: { hourHeight: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight;
  return (
    <div className="pointer-events-none absolute right-0 left-0 z-20 border-t border-danger" style={{ top }}>
      <div className="-mt-[3px] -ml-[3px] h-1.5 w-1.5 rounded-full bg-danger" />
    </div>
  );
}

type BlockProps = { pos?: { lane: number; lanes: number }; hourHeight: number; lookups: Lookups } & (
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'alloc'; alloc: Allocation }
);

const Block = memo(function Block(props: BlockProps) {
  const { pos = { lane: 0, lanes: 1 }, hourHeight, lookups } = props;
  const openItem = useUi((s) => s.openItem);
  const setOpenEvent = useUi((s) => s.setOpenEvent);
  const id = props.kind === 'event' ? `event:${props.event.id}` : `alloc:${props.alloc.id}`;
  const data: Drag = props.kind === 'event' ? { kind: 'event', event: props.event } : { kind: 'alloc', alloc: props.alloc };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });

  let start: number, end: number, title: string, sub: string, color: string, done = false;
  if (props.kind === 'event') {
    start = toMinutes(props.event.start);
    end = toMinutes(props.event.end);
    title = props.event.title;
    sub = `${props.event.start}–${props.event.end}`;
    color = FALLBACK_COLOR;
  } else {
    const item = lookups.item(props.alloc.itemId);
    start = toMinutes(props.alloc.start!);
    end = start + props.alloc.plannedHours * 60;
    title = item?.title ?? '?';
    sub = `${props.alloc.start} · ${fmtH(props.alloc.plannedHours)}${item ? ` · ${lookups.project(item.projectId)?.name ?? ''}` : ''}`;
    color = lookups.color(item);
    done = props.alloc.done || (item ? isItemDone(item) : false);
  }
  const height = Math.max(((end - start) / 60) * hourHeight, 16);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => (props.kind === 'event' ? setOpenEvent({ id: props.event.id }) : openItem(props.alloc.itemId))}
      className={`absolute z-10 cursor-grab touch-none overflow-hidden rounded-sm px-1 py-px text-[11px] leading-tight active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      } ${props.kind === 'event' ? 'border border-line bg-raised text-fg' : 'border-l-2'}`}
      style={{
        top: (start / 60) * hourHeight,
        height,
        left: `calc(${(pos.lane / pos.lanes) * 100}% + 1px)`,
        width: `calc(${100 / pos.lanes}% - 3px)`,
        ...(props.kind === 'alloc' && { borderLeftColor: color, background: `color-mix(in srgb, ${color} 18%, var(--color-panel))` }),
      }}
      title={`${title}\n${sub}`}
    >
      <div className={`truncate font-medium ${done ? 'text-dim line-through' : 'text-strong'}`}>{title}</div>
      {height > 28 && <div className="truncate text-[10px] text-dim">{sub}</div>}
    </div>
  );
});

function DragGhost({ drag }: { drag: Drag }) {
  const lookups = useLookups();
  const title = drag.kind === 'event' ? drag.event.title : (lookups.item(drag.alloc.itemId)?.title ?? '');
  return (
    <div className="w-40 cursor-grabbing truncate rounded-sm border border-accent/60 bg-raised px-1 py-0.5 text-[11px] shadow-lg shadow-black/50">
      {title}
    </div>
  );
}
