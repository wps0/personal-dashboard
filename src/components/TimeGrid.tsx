import {ChevronDown, ChevronUp} from 'lucide-react';
import {sameProps} from '../sameProps';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  pointerWithin,
} from '@dnd-kit/core';
import {
  clicksSuppressed,
  ghostUnderPointer,
  suppressClicks,
  useDragSensors,
} from '../dnd';
import {create} from 'zustand';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {fmtH} from '../format';
import {useCapacities, useLookups, useSlide, type Lookups} from '../hooks';
import {reservedFor} from '../model/capacity';
import {dayName, todayISO} from '../model/dates';
import {isItemDone} from '../model/selectors';
import {
  fromMinutes,
  layoutSpans,
  slotRange,
  snap,
  toMinutes,
} from '../model/time';
import type {Allocation, CalendarEvent, ISODate} from '../model/types';
import {useStore} from '../store';
import {draftAt, useUi} from '../ui';
import {CapacityBadge} from './CapacityBadge';
import {GoogleChip, GoogleTimedBlock} from './GoogleEvent';
import {noGoogleEvents, useGoogleEvents} from '../google/useGoogleEvents';
import type {GEvent} from '../google/events';
import {DraftEditor, EventEditor} from './EventEditor';
import {BlockLabel, blockTextClass} from './BlockLabel';
import {Popover, PopoverAnchor, PopoverContent, useBeside} from './ui/Popover';
import {
  deleteEvent,
  removeSession,
  toggleSession,
  updateEvent,
  updateSession,
} from '../actions';
import {blockKeys} from '../keyboard';

interface Props {
  days: ISODate[];
  /** Pixel height of one hour. */
  hourHeight?: number;
  /** Hour to scroll to initially. */
  scrollToHour?: number;
  /** Clicking a day number in the header (e.g. to open the day view). */
  onDayClick?(date: ISODate): void;
}

type Drag =
  {kind: 'alloc'; alloc: Allocation} | {kind: 'event'; event: CalendarEvent};
type Span = {start: number; end: number; label?: string};

const EMPTY: never[] = [];

/**
 * Where a block being dragged over a day column would land. Kept outside React
 * state so pointer moves re-render only the preview, not the grid.
 */
const useDropPreview = create<{
  drag: Drag | null;
  date: ISODate | null;
  start: number;
}>(() => ({drag: null, date: null, start: 0}));
const NO_PREVIEW = {drag: null, date: null, start: 0};
const DAY_MIN = 24 * 60;

function clientY(e: Event | null): number {
  if (!e) return 0;
  if ('touches' in e) return (e as TouchEvent).touches[0]?.clientY ?? 0;
  return (e as PointerEvent).clientY;
}

/**
 * Google-Calendar-style day columns: an all-day row, then an hour grid with
 * events and time-blocked task sessions. Click or drag on empty grid to create
 * an event; drag blocks to move them; drag their bottom edge to resize.
 */
export function TimeGrid({
  days,
  hourHeight = 48,
  scrollToHour = 7,
  onDayClick,
}: Props) {
  // The DndContext owner must not subscribe to data, or every data change
  // re-renders all draggables. GridBody holds the subscriptions.
  const grab = useRef(0);
  const pointerY = useRef(0);
  const over = useRef<string | null>(null);
  const [dragging, setDragging] = useState<Drag | null>(null);

  const sensors = useDragSensors();

  /** Start minute for a drop on `date`'s column at the current pointer, or null. */
  const dropStart = (date: string): number | null => {
    const col = document.querySelector(`[data-col="${date}"]`);
    if (!col) return null;
    const top =
      pointerY.current - grab.current - col.getBoundingClientRect().top;
    return Math.max(0, Math.min(DAY_MIN - 15, snap((top / hourHeight) * 60)));
  };
  const updatePreview = () => {
    const [zone, date] = over.current?.split('|') ?? [];
    const start = zone === 'col' ? dropStart(date) : null;
    useDropPreview.setState(
      start === null ? {date: null, start: 0} : {date, start},
    );
  };

  const trackOver = (e: DragOverEvent | DragMoveEvent) => {
    over.current = typeof e.over?.id === 'string' ? e.over.id : null;
    updatePreview();
  };

  // Track the real pointer: dnd-kit's delta mixes in scroll compensation that
  // doesn't match the grid's own scroll container.
  const trackPointer = (ev: PointerEvent | TouchEvent) => {
    pointerY.current = clientY(ev);
    updatePreview();
  };
  const stopTracking = () => {
    window.removeEventListener('pointermove', trackPointer);
    window.removeEventListener('touchmove', trackPointer);
    window.removeEventListener('scroll', updatePreview, true);
    over.current = null;
    useDropPreview.setState(NO_PREVIEW);
  };

  const onDragStart = (e: DragStartEvent) => {
    const drag = e.active.data.current as Drag;
    setDragging(drag);
    useDropPreview.setState({drag});
    useUi.getState().openEvent(null);
    pointerY.current = clientY(e.activatorEvent);
    window.addEventListener('pointermove', trackPointer);
    window.addEventListener('touchmove', trackPointer);
    // The grid auto-scrolls near its edges; keep the preview under the pointer.
    window.addEventListener('scroll', updatePreview, true);
    const node = (e.activatorEvent?.target as Element | null)?.closest(
      '[aria-roledescription="draggable"]',
    );
    grab.current = node
      ? pointerY.current - node.getBoundingClientRect().top
      : 0;
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    suppressClicks();
    stopTracking();
    const drag = e.active.data.current as Drag | undefined;
    const target = e.over?.id;
    if (!drag || typeof target !== 'string') return;
    const [zone, date] = target.split('|');
    if (zone === 'strip') {
      if (drag.kind === 'alloc')
        updateSession(drag.alloc.id, {date, start: undefined});
      else updateEvent(drag.event.id, {date, allDay: true});
      return;
    }
    // Lands where the preview showed it: same pointer position, same math.
    const start = dropStart(date);
    if (start === null) return;
    if (drag.kind === 'alloc') {
      updateSession(drag.alloc.id, {date, start: fromMinutes(start)});
    } else {
      const ev = drag.event;
      const len = ev.allDay ? 60 : toMinutes(ev.end) - toMinutes(ev.start);
      updateEvent(ev.id, {
        date,
        allDay: false,
        start: fromMinutes(start),
        end: fromMinutes(Math.min(start + len, DAY_MIN - 1)),
      });
    }
  };

  return (
    <DndContext
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Enter opens, Space marks done, Delete removes, arrow keys move between items. Drag with the mouse or a finger to move.',
        },
      }}
      sensors={sensors}
      // The target is the column under the pointer (the floating copy is
      // hidden over columns, so it can't be used to detect the target).
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragOver={trackOver}
      onDragMove={trackOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => (setDragging(null), suppressClicks(), stopTracking())}
    >
      <GridBody
        days={days}
        hourHeight={hourHeight}
        scrollToHour={scrollToHour}
        onDayClick={onDayClick}
      />
      <DragOverlay dropAnimation={null} modifiers={[ghostUnderPointer]}>
        {dragging && <DragGhost drag={dragging} />}
      </DragOverlay>
    </DndContext>
  );
}

type DayData = {
  timed: Allocation[];
  untimed: Allocation[];
  events: CalendarEvent[];
  allDay: CalendarEvent[];
};

type BodyProps = Required<Omit<Props, 'onDayClick'>> &
  Pick<Props, 'onDayClick'>;

function GridBody({days, hourHeight, scrollToHour, onDayClick}: BodyProps) {
  const allocations = useStore(s => s.data.allocations);
  const events = useStore(s => s.data.events);
  const rules = useStore(s => s.data.settings.capacityRules);
  const hidden = useUi(s => s.hidden);
  const draftElsewhere = useUi(s => !!s.draft && !days.includes(s.draft.date));
  const lookups = useLookups();
  const capacities = useCapacities(days);
  const today = todayISO();
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({top: scrollToHour * hourHeight});
  }, [scrollToHour, hourHeight]);

  const reserved = useMemo(
    () => new Map(days.map(d => [d, reservedFor(rules, d)])),
    [days, rules],
  );

  const google = useGoogleEvents(days);
  const googleByDay = useMemo(() => {
    const m = new Map<ISODate, {timed: GEvent[]; allDay: GEvent[]}>();
    for (const d of days) {
      const list = google.get(d) ?? noGoogleEvents;
      m.set(d, {
        timed: list.filter(e => !e.allDay),
        allDay: list.filter(e => e.allDay),
      });
    }
    return m;
  }, [google, days]);

  const byDay = useMemo(() => {
    const want = new Set(days);
    const showEvents = !hidden.includes('events');
    const visibleAlloc = (a: Allocation) => {
      if (!hidden.length) return true;
      const item = lookups.item(a.itemId);
      const area = item && lookups.project(item.projectId)?.areaId;
      return !area || !hidden.includes(area);
    };
    const m = new Map<ISODate, DayData>();
    for (const d of days)
      m.set(d, {timed: [], untimed: [], events: [], allDay: []});
    for (const a of allocations)
      if (want.has(a.date) && visibleAlloc(a))
        (a.start ? m.get(a.date)!.timed : m.get(a.date)!.untimed).push(a);
    if (showEvents)
      for (const e of events)
        if (want.has(e.date))
          (e.allDay ? m.get(e.date)!.allDay : m.get(e.date)!.events).push(e);
    return m;
  }, [allocations, events, days, hidden, lookups]);

  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;
  const slide = useSlide(days[0]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden select-none">
      {draftElsewhere && <OffscreenDraft />}
      <div
        key={`h${days[0]}`}
        className={`grid shrink-0 ${slide}`}
        style={{gridTemplateColumns: cols}}
      >
        <div />
        {days.map(d => {
          const day = byDay.get(d)!;
          const planned = [...day.timed, ...day.untimed].reduce(
            (s, a) => s + a.plannedHours,
            0,
          );
          const isToday = d === today;
          return (
            <div key={d} className="flex flex-col items-center pt-1.5 pb-1">
              <span
                className={`text-[11px] font-medium uppercase ${isToday ? 'text-accent' : 'text-dim'}`}
              >
                {dayName(d)}
              </span>
              <button
                onClick={() => onDayClick?.(d)}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-[22px] tabular-nums transition-colors duration-150 active:scale-95 ${
                  isToday
                    ? 'bg-accent text-on-accent'
                    : 'text-strong hover:bg-raised'
                }`}
              >
                {Number(d.slice(8))}
              </button>
              <CapacityBadge
                date={d}
                planned={planned}
                info={capacities.get(d)!}
                isPast={d < today}
              />
            </div>
          );
        })}
      </div>
      <div
        key={`s${days[0]}`}
        className={`grid shrink-0 border-b border-line ${slide}`}
        style={{gridTemplateColumns: cols}}
      >
        <AllDayGutter />
        {days.map(d => (
          <Strip
            key={d}
            date={d}
            allocs={byDay.get(d)!.untimed}
            events={byDay.get(d)!.allDay}
            google={googleByDay.get(d)!.allDay}
            lookups={lookups}
          />
        ))}
      </div>
      <div
        ref={scrollRef}
        className="scroll-thin relative min-h-0 flex-1 overflow-y-auto"
      >
        <div
          key={`g${days[0]}`}
          className={`grid ${slide}`}
          style={{gridTemplateColumns: cols, height: 24 * hourHeight}}
        >
          <div className="relative">
            {Array.from({length: 24}, (_, h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-dim tabular-nums"
                style={{top: h * hourHeight}}
              >
                {h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}
              </span>
            ))}
          </div>
          {days.map(d => {
            const day = byDay.get(d)!;
            return (
              <Column
                key={d}
                date={d}
                isToday={d === today}
                timed={day.timed.length ? day.timed : EMPTY}
                events={day.events.length ? day.events : EMPTY}
                reserved={reserved.get(d)!}
                google={googleByDay.get(d)!.timed}
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

/** Draft moved to a date this grid doesn't show (e.g. via its date picker): keep the editor open. */
function OffscreenDraft() {
  return (
    <Popover open onOpenChange={o => !o && useUi.getState().setDraft(null)}>
      <PopoverAnchor className="absolute top-2 right-1/2 h-0 w-0" />
      <PopoverContent side="bottom">
        <DraftEditor />
      </PopoverContent>
    </Popover>
  );
}

const Strip = memo(function Strip(props: {
  date: ISODate;
  allocs: Allocation[];
  events: CalendarEvent[];
  google: GEvent[];
  lookups: Lookups;
}) {
  const {date, allocs, events, google, lookups} = props;
  const {setNodeRef, isOver} = useDroppable({id: `strip|${date}`});
  const hasDraft = useUi(s => !!s.draft?.allDay && s.draft.date === date);
  const collapsed = useUi(s => s.allDayCollapsed);
  const chips = [
    ...events.map(e => <AllDayChip key={e.id} event={e} />),
    ...google.map(e => <GoogleChip key={e.key} ev={e} variant="strip" />),
    ...allocs.map(a => <StripChip key={a.id} alloc={a} lookups={lookups} />),
  ];
  const shown = collapsed ? chips.slice(0, COLLAPSED_ITEMS) : chips;
  const more = chips.length - shown.length;
  return (
    <div
      ref={setNodeRef}
      onClick={e => {
        if (e.target !== e.currentTarget || clicksSuppressed()) return;
        useUi.getState().setDraft(draftAt(date, 9 * 60, 10 * 60, true));
      }}
      className={`drop-target scroll-thin max-h-24 min-h-7 cursor-pointer space-y-px overflow-y-auto border-l border-line p-0.5 hover:bg-raised/50 ${isOver ? 'is-over bg-accent/10' : ''}`}
      title="Click to add an all-day event"
    >
      {shown}
      {more > 0 && (
        <button
          className="block w-full rounded px-1.5 text-left text-[11px] font-medium text-dim hover:bg-raised hover:text-fg"
          onClick={() => useUi.getState().setAllDayCollapsed(false)}
        >
          {more} more
        </button>
      )}
      {hasDraft && <DraftChip />}
    </div>
  );
}, sameProps);

/** Items per day in the all-day row while it's collapsed. */
const COLLAPSED_ITEMS = 2;

/** "all-day" label with the collapse / expand toggle, like Google Calendar's chevron. */
function AllDayGutter() {
  const collapsed = useUi(s => s.allDayCollapsed);
  const Icon = collapsed ? ChevronDown : ChevronUp;
  return (
    <div className="flex flex-col items-end justify-end gap-0.5 pr-1 pb-1 text-[10px] text-dim">
      all-day
      <button
        className="icon-btn h-5 w-5"
        aria-expanded={!collapsed}
        aria-label={
          collapsed ? 'Show all all-day items' : 'Collapse the all-day row'
        }
        title={collapsed ? 'Show all' : 'Collapse'}
        onClick={() => useUi.getState().setAllDayCollapsed(!collapsed)}
      >
        <Icon size={14} />
      </button>
    </div>
  );
}

const AllDayChip = memo(function AllDayChip({event}: {event: CalendarEvent}) {
  const open = useUi(s => s.openEventId === event.id);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `event:${event.id}`,
    data: {kind: 'event', event} satisfies Drag,
  });
  return (
    <Popover
      open={open}
      onOpenChange={o => !o && useUi.getState().openEvent(null)}
    >
      <PopoverAnchor asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          data-block
          onKeyDown={blockKeys({
            open: () => useUi.getState().openEvent(event.id),
            remove: () => deleteEvent(event),
          })}
          onClick={() =>
            !clicksSuppressed() && useUi.getState().openEvent(event.id)
          }
          className={`block-interactive cursor-pointer touch-none truncate rounded px-1.5 py-px text-[11px] font-medium ${isDragging ? 'opacity-30' : ''}`}
          style={{
            background: 'var(--color-event)',
            color: 'var(--color-on-block)',
          }}
        >
          {event.title}
        </div>
      </PopoverAnchor>
      {open && (
        <PopoverContent side="bottom" align="start">
          <EventEditor eventId={event.id} />
        </PopoverContent>
      )}
    </Popover>
  );
});

const StripChip = memo(function StripChip({
  alloc,
  lookups,
}: {
  alloc: Allocation;
  lookups: Lookups;
}) {
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `alloc:${alloc.id}`,
    data: {kind: 'alloc', alloc} satisfies Drag,
  });
  const item = lookups.item(alloc.itemId);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-block
      onKeyDown={blockKeys({
        open: () => useUi.getState().openItem(alloc.itemId),
        toggle: () => toggleSession(alloc.id),
        remove: () => removeSession(alloc.id),
      })}
      onClick={() =>
        !clicksSuppressed() && useUi.getState().openItem(alloc.itemId)
      }
      className={`block-interactive flex cursor-pointer touch-none items-center gap-1 truncate rounded border-l-4 px-1.5 py-px text-[11px] font-medium ${isDragging ? 'opacity-30' : ''} ${
        alloc.done ? 'line-through opacity-60' : ''
      }`}
      style={{
        background: `color-mix(in srgb, ${lookups.color(item)} 55%, var(--color-panel))`,
        borderLeftColor: lookups.color(item),
      }}
      title="Planned without a time: drag onto the grid to time-block it"
    >
      <span className="min-w-0 flex-1 truncate text-strong">{item?.title}</span>
      <span className="tabular-nums opacity-70">
        {fmtH(alloc.plannedHours)}
      </span>
    </div>
  );
});

function DraftChip() {
  const title = useUi(s => s.draft?.title);
  return (
    <Popover open onOpenChange={o => !o && useUi.getState().setDraft(null)}>
      <PopoverAnchor asChild>
        <div
          className="animate-pop-in truncate rounded px-1.5 py-px text-[11px] font-medium shadow-md"
          style={{
            background: 'var(--color-event)',
            color: 'var(--color-on-block)',
          }}
        >
          {title || '(No title)'}
        </div>
      </PopoverAnchor>
      <PopoverContent side="bottom" align="start">
        <DraftEditor />
      </PopoverContent>
    </Popover>
  );
}

interface ColumnProps {
  date: ISODate;
  isToday: boolean;
  timed: Allocation[];
  events: CalendarEvent[];
  reserved: Span[];
  /** Read-only Google events for this day. */
  google: GEvent[];
  hourHeight: number;
  lookups: Lookups;
}

// Days whose lists didn't change get equal props (sameProps), so they skip
// re-rendering.
const Column = memo(function Column({
  date,
  isToday,
  timed,
  events,
  reserved,
  google,
  hourHeight,
  lookups,
}: ColumnProps) {
  const {setNodeRef, isOver} = useDroppable({id: `col|${date}`});
  const hasDraft = useUi(
    s => !!s.draft && !s.draft.allDay && s.draft.date === date,
  );
  // Slot selection in progress: anchor/current minutes, and whether the pointer moved enough to count as a drag.
  const [sel, setSel] = useState<{
    a: number;
    b: number;
    y0: number;
    dragged: boolean;
  } | null>(null);

  const layout = useMemo(
    () =>
      layoutSpans([
        ...google.map(e => ({id: e.key, start: e.startMin, end: e.endMin})),
        ...events.map(e => ({
          id: e.id,
          start: toMinutes(e.start),
          end: toMinutes(e.end),
        })),
        ...timed.map(a => ({
          id: a.id,
          start: toMinutes(a.start!),
          end: toMinutes(a.start!) + a.plannedHours * 60,
        })),
      ]),
    [events, timed, google],
  );

  const minuteAt = (e: ReactPointerEvent<HTMLElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return Math.max(0, Math.min(DAY_MIN, (y / hourHeight) * 60));
  };

  return (
    <div
      ref={setNodeRef}
      data-col={date}
      onPointerDown={e => {
        if (e.button !== 0 || e.target !== e.currentTarget) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const m = minuteAt(e);
        setSel({a: m, b: m, y0: e.clientY, dragged: false});
      }}
      onPointerMove={e =>
        sel &&
        setSel({
          ...sel,
          b: minuteAt(e),
          dragged: sel.dragged || Math.abs(e.clientY - sel.y0) > 3,
        })
      }
      onPointerUp={() => {
        if (!sel) return;
        setSel(null);
        // A click makes an event of the default length (on the half hour, or the quarter for
        // defaults under 30 min); any drag selects whole 15-minute slots (min 15 min).
        const [lo, hi] = slotRange(sel.a, sel.b);
        const len = useStore.getState().data.settings.defaultEventMinutes;
        const step = len < 30 ? 15 : 30;
        const start = Math.min(Math.floor(sel.a / step) * step, DAY_MIN - len);
        const draft = sel.dragged
          ? draftAt(date, lo, Math.min(hi, DAY_MIN - 1))
          : draftAt(date, start, start + len);
        useUi.getState().setDraft(draft);
      }}
      onPointerCancel={() => setSel(null)}
      className={`drop-target relative border-l border-line ${isOver ? 'is-over bg-accent/5' : ''}`}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0 1px, transparent 1px ${hourHeight}px)`,
      }}
    >
      {reserved.map((r, i) => (
        <div
          key={i}
          className="reserved pointer-events-none absolute right-0 left-0"
          style={{
            top: (r.start / 60) * hourHeight,
            height: ((r.end - r.start) / 60) * hourHeight,
          }}
        >
          {r.label && r.end - r.start >= 45 && (
            <span className="absolute top-0.5 left-1 text-[10px] text-dim/80">
              {r.label}
            </span>
          )}
        </div>
      ))}
      {events.map(e => (
        <EventBlock
          key={e.id}
          event={e}
          pos={layout.get(e.id)}
          hourHeight={hourHeight}
        />
      ))}
      {google.map(e => (
        <GoogleTimedBlock
          key={e.key}
          ev={e}
          pos={layout.get(e.key)}
          hourHeight={hourHeight}
        />
      ))}
      {timed.map(a => (
        <AllocBlock
          key={a.id}
          alloc={a}
          pos={layout.get(a.id)}
          hourHeight={hourHeight}
          lookups={lookups}
        />
      ))}
      {sel?.dragged && (
        <SelectionGhost from={sel.a} to={sel.b} hourHeight={hourHeight} />
      )}
      {hasDraft && <DraftBlock hourHeight={hourHeight} />}
      <DropPreview date={date} hourHeight={hourHeight} lookups={lookups} />
      {isToday && <NowLine hourHeight={hourHeight} />}
    </div>
  );
}, sameProps);

function SelectionGhost({
  from,
  to,
  hourHeight,
}: {
  from: number;
  to: number;
  hourHeight: number;
}) {
  const [lo, hi] = slotRange(from, to);
  return (
    <div
      className="pointer-events-none absolute right-1 left-0.5 z-20 rounded-md px-1.5 py-0.5 text-[11px] font-medium shadow-lg"
      style={{
        top: (lo / 60) * hourHeight,
        height: ((hi - lo) / 60) * hourHeight,
        background: 'var(--color-event)',
        color: 'var(--color-on-block)',
      }}
    >
      {fromMinutes(lo)} – {fromMinutes(hi)}
    </div>
  );
}

/** The event being created, anchored to its quick-create card. */
function DraftBlock({hourHeight}: {hourHeight: number}) {
  const draft = useUi(s => s.draft)!;
  const start = toMinutes(draft.start);
  const end = Math.max(start + 15, toMinutes(draft.end));
  const height = Math.max(((end - start) / 60) * hourHeight, 14);
  const [anchor, beside] = useBeside(true);
  return (
    <Popover open onOpenChange={o => !o && useUi.getState().setDraft(null)}>
      <PopoverAnchor asChild ref={anchor}>
        <div
          className={`absolute right-1 left-0.5 z-20 animate-pop-in overflow-hidden rounded-md px-1.5 text-[11px] shadow-lg transition-[top,height] duration-150 ${blockTextClass(height)}`}
          style={{
            top: (start / 60) * hourHeight,
            height,
            background: 'var(--color-event)',
            color: 'var(--color-on-block)',
          }}
        >
          <BlockLabel
            height={height}
            title={draft.title || '(No title)'}
            start={draft.start}
            details={`${draft.start} – ${draft.end}`}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent {...beside}>
        <DraftEditor />
      </PopoverContent>
    </Popover>
  );
}

function NowLine({hourHeight}: {hourHeight: number}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight;
  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-30 border-t-2 border-danger"
      style={{top}}
    >
      <div className="-mt-[7px] -ml-[6px] h-3 w-3 rounded-full bg-danger" />
    </div>
  );
}

/** Drag the bottom edge of a block to change its length (15-minute steps). */
function useResize(
  startMin: number,
  hourHeight: number,
  commit: (endMin: number) => void,
) {
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);
  const handleProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.stopPropagation(); // don't start a dnd-kit drag
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const col = target.closest('[data-col]')!.getBoundingClientRect();
      const toEnd = (y: number) =>
        Math.max(
          startMin + 15,
          Math.min(DAY_MIN - 1, snap(((y - col.top) / hourHeight) * 60)),
        );
      const move = (ev: PointerEvent) => setPreviewEnd(toEnd(ev.clientY));
      const up = (ev: PointerEvent) => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        setPreviewEnd(null);
        suppressClicks();
        commit(toEnd(ev.clientY));
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
    },
    onClick: (e: ReactMouseEvent) => e.stopPropagation(),
  };
  return {previewEnd, handleProps};
}

type Pos = {lane: number; lanes: number};

/** Resize grip height: 6px on normal blocks, a thin edge on short ones so the rest stays clickable. */
const handleHeight = (blockPx: number) => Math.max(3, Math.min(6, blockPx / 5));

function blockStyle(start: number, end: number, pos: Pos, hourHeight: number) {
  return {
    top: (start / 60) * hourHeight,
    height: Math.max(((end - start) / 60) * hourHeight - 1, 14),
    left: `calc(${(pos.lane / pos.lanes) * 100}% + 2px)`,
    width: `calc(${100 / pos.lanes}% - 6px)`,
  };
}

const EventBlock = memo(function EventBlock({
  event,
  pos = {lane: 0, lanes: 1},
  hourHeight,
}: {
  event: CalendarEvent;
  pos?: Pos;
  hourHeight: number;
}) {
  const open = useUi(s => s.openEventId === event.id);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `event:${event.id}`,
    data: {kind: 'event', event} satisfies Drag,
  });
  const start = toMinutes(event.start);
  const {previewEnd, handleProps} = useResize(start, hourHeight, end =>
    updateEvent(event.id, {end: fromMinutes(end)}, 'Event resized'),
  );
  const end = previewEnd ?? toMinutes(event.end);
  const height = ((end - start) / 60) * hourHeight;
  const [anchor, beside] = useBeside(open);

  return (
    <Popover
      open={open}
      onOpenChange={o => !o && useUi.getState().openEvent(null)}
    >
      <PopoverAnchor asChild ref={anchor}>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          data-block
          onKeyDown={blockKeys({
            open: () => useUi.getState().openEvent(event.id),
            remove: () => deleteEvent(event),
          })}
          onClick={() =>
            !clicksSuppressed() && useUi.getState().openEvent(event.id)
          }
          className={`block-interactive absolute z-10 cursor-pointer touch-none overflow-hidden rounded-md px-1.5 text-[11px] ${blockTextClass(height)} ${
            isDragging ? 'opacity-30' : ''
          } ${open ? 'shadow-lg ring-2 ring-bg' : ''} ${previewEnd != null ? 'resizing' : ''}`}
          style={{
            ...blockStyle(start, end, pos, hourHeight),
            background: 'var(--color-event)',
            color: 'var(--color-on-block)',
          }}
        >
          <BlockLabel
            height={height}
            title={event.title}
            start={event.start}
            details={`${event.start} – ${fromMinutes(end)}`}
          />
          <div
            {...handleProps}
            className="absolute right-0 bottom-0 left-0 cursor-ns-resize"
            style={{height: handleHeight(height)}}
          />
        </div>
      </PopoverAnchor>
      {open && (
        <PopoverContent {...beside}>
          <EventEditor eventId={event.id} />
        </PopoverContent>
      )}
    </Popover>
  );
});

const AllocBlock = memo(function AllocBlock(props: {
  alloc: Allocation;
  pos?: Pos;
  hourHeight: number;
  lookups: Lookups;
}) {
  const {alloc, pos = {lane: 0, lanes: 1}, hourHeight, lookups} = props;
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `alloc:${alloc.id}`,
    data: {kind: 'alloc', alloc} satisfies Drag,
  });
  const item = lookups.item(alloc.itemId);
  const start = toMinutes(alloc.start!);
  const {previewEnd, handleProps} = useResize(start, hourHeight, end =>
    updateSession(
      alloc.id,
      {plannedHours: (end - start) / 60},
      'Session resized',
    ),
  );
  const end = previewEnd ?? start + alloc.plannedHours * 60;
  const height = ((end - start) / 60) * hourHeight;
  const done = alloc.done || (item ? isItemDone(item) : false);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-block
      onKeyDown={blockKeys({
        open: () => useUi.getState().openItem(alloc.itemId),
        toggle: () => toggleSession(alloc.id),
        remove: () => removeSession(alloc.id),
      })}
      onClick={() =>
        !clicksSuppressed() && useUi.getState().openItem(alloc.itemId)
      }
      className={`block-interactive absolute z-10 cursor-pointer touch-none overflow-hidden rounded-md border-l-4 px-1.5 text-[11px] ${blockTextClass(height)} ${
        isDragging ? 'opacity-30' : done ? 'opacity-60' : ''
      } ${previewEnd != null ? 'resizing' : ''}`}
      style={{
        ...blockStyle(start, end, pos, hourHeight),
        background: `color-mix(in srgb, ${lookups.color(item)} 55%, var(--color-panel))`,
        borderLeftColor: lookups.color(item),
      }}
      title={`${item?.title ?? ''}\n${alloc.start} · ${fmtH((end - start) / 60)}`}
    >
      <BlockLabel
        height={height}
        title={
          <span className={`strike ${done ? 'is-struck' : ''}`}>
            {item?.title}
          </span>
        }
        titleClassName="text-strong"
        start={alloc.start!}
        details={`${alloc.start} – ${fromMinutes(end)} · ${
          item ? (lookups.project(item.projectId)?.name ?? '') : ''
        }`}
      />
      <div
        {...handleProps}
        className="absolute right-0 bottom-0 left-0 cursor-ns-resize"
        style={{height: handleHeight(height)}}
      />
    </div>
  );
});

/**
 * While a block is dragged over this column: where it would land, with its new
 * time, like Google Calendar. Only this component re-renders on pointer moves.
 */
function DropPreview({
  date,
  hourHeight,
  lookups,
}: {
  date: ISODate;
  hourHeight: number;
  lookups: Lookups;
}) {
  const start = useDropPreview(s => (s.date === date ? s.start : null));
  const drag = useDropPreview(s => s.drag);
  if (start === null || !drag) return null;
  const len =
    drag.kind === 'alloc'
      ? Math.round(drag.alloc.plannedHours * 60)
      : drag.event.allDay
        ? 60
        : toMinutes(drag.event.end) - toMinutes(drag.event.start);
  const end = Math.min(start + len, DAY_MIN - 1);
  const height = Math.max(((end - start) / 60) * hourHeight - 1, 14);
  const item = drag.kind === 'alloc' ? lookups.item(drag.alloc.itemId) : null;
  const title = drag.kind === 'alloc' ? (item?.title ?? '') : drag.event.title;
  return (
    <div
      data-drop-preview
      className={`pointer-events-none absolute right-1 left-0.5 z-30 overflow-hidden rounded-md px-1.5 text-[11px] shadow-lg ring-2 ring-bg ${blockTextClass(height)} ${
        drag.kind === 'alloc' ? 'border-l-4 text-strong' : ''
      }`}
      style={{
        top: (start / 60) * hourHeight,
        height,
        ...(drag.kind === 'alloc'
          ? {
              background: `color-mix(in srgb, ${lookups.color(item ?? undefined)} 55%, var(--color-panel))`,
              borderLeftColor: lookups.color(item ?? undefined),
            }
          : {
              background: 'var(--color-event)',
              color: 'var(--color-on-block)',
            }),
      }}
    >
      <BlockLabel
        height={height}
        title={title}
        start={fromMinutes(start)}
        details={`${fromMinutes(start)} – ${fromMinutes(end)}`}
      />
    </div>
  );
}

/** The floating copy under the pointer, shown when not over a day column (there the preview shows it). */
function DragGhost({drag}: {drag: Drag}) {
  const overColumn = useDropPreview(s => s.date !== null);
  const lookups = useLookups();
  if (overColumn) return null;
  const title =
    drag.kind === 'event'
      ? drag.event.title
      : (lookups.item(drag.alloc.itemId)?.title ?? '');
  return (
    <div
      className="w-40 animate-lift cursor-grabbing truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium shadow-xl"
      style={{
        background:
          drag.kind === 'event'
            ? 'var(--color-event)'
            : lookups.color(lookups.item(drag.alloc.itemId)),
        color: 'var(--color-on-block)',
      }}
    >
      {title}
    </div>
  );
}
