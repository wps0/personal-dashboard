import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {clicksSuppressed, suppressClicks, useDragSensors} from '../dnd';
import {memo, useMemo, useState} from 'react';
import {useLookups, useSlide, type Lookups} from '../hooks';
import {monthGrid, todayISO} from '../model/dates';
import type {Allocation, CalendarEvent, ISODate} from '../model/types';
import {useStore} from '../store';
import {draftAt, useUi} from '../ui';
import {DraftEditor, EventEditor} from './EventEditor';
import {GoogleChip} from './GoogleEvent';
import {useGoogleEvents} from '../google/useGoogleEvents';
import type {GEvent} from '../google/events';
import {fromMinutes} from '../model/time';
import {Popover, PopoverAnchor, PopoverContent} from './ui/Popover';
import {
  deleteEvent,
  removeSession,
  toggleSession,
  updateEvent,
  updateSession,
} from '../actions';
import {blockKeys} from '../keyboard';

type Entry =
  | {kind: 'event'; event: CalendarEvent}
  | {kind: 'alloc'; alloc: Allocation}
  | {kind: 'google'; ev: GEvent};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_ENTRIES = 3;

/** Month view: 6×7 cells with events and planned sessions; drag entries between days. */
export function MonthGrid({
  date,
  onDayClick,
}: {
  date: ISODate;
  onDayClick(d: ISODate): void;
}) {
  const [dragging, setDragging] = useState<Entry | null>(null);
  const sensors = useDragSensors();
  const onDragStart = (e: DragStartEvent) => {
    setDragging(e.active.data.current as Entry);
    useUi.getState().openEvent(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    suppressClicks();
    const entry = e.active.data.current as Entry | undefined;
    const target = e.over?.id;
    if (!entry || typeof target !== 'string') return;
    const day = target.slice('cell|'.length);
    if (entry.kind === 'event') updateEvent(entry.event.id, {date: day});
    else if (entry.kind === 'alloc') updateSession(entry.alloc.id, {date: day});
    // Google events are read-only and never draggable.
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
      <MonthBody date={date} onDayClick={onDayClick} />
      <DragOverlay dropAnimation={null}>
        {dragging && <Ghost entry={dragging} />}
      </DragOverlay>
    </DndContext>
  );
}

function MonthBody({
  date,
  onDayClick,
}: {
  date: ISODate;
  onDayClick(d: ISODate): void;
}) {
  const events = useStore(s => s.data.events);
  const allocations = useStore(s => s.data.allocations);
  const hidden = useUi(s => s.hidden);
  const lookups = useLookups();
  const days = useMemo(() => monthGrid(date), [date]);
  const month = date.slice(0, 7);
  const today = todayISO();
  const slide = useSlide(date);

  const google = useGoogleEvents(days);
  const byDay = useMemo(() => {
    const want = new Set(days);
    const m = new Map<ISODate, Entry[]>(days.map(d => [d, []]));
    for (const [d, list] of google)
      if (want.has(d))
        for (const ev of list) m.get(d)!.push({kind: 'google', ev});
    if (!hidden.includes('events'))
      for (const e of events)
        if (want.has(e.date)) m.get(e.date)!.push({kind: 'event', event: e});
    for (const a of allocations) {
      if (!want.has(a.date)) continue;
      const item = lookups.item(a.itemId);
      const area = item && lookups.project(item.projectId)?.areaId;
      if (area && hidden.includes(area)) continue;
      m.get(a.date)!.push({kind: 'alloc', alloc: a});
    }
    // All-day first, then by time, then untimed sessions.
    const key = (x: Entry) =>
      x.kind === 'google'
        ? x.ev.allDay
          ? '0'
          : `1${fromMinutes(x.ev.startMin)}`
        : x.kind === 'event'
          ? x.event.allDay
            ? '0'
            : `1${x.event.start}`
          : x.alloc.start
            ? `1${x.alloc.start}`
            : '2';
    for (const list of m.values())
      list.sort((a, b) => key(a).localeCompare(key(b)));
    return m;
  }, [days, events, allocations, hidden, lookups, google]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden select-none">
      <div className="grid shrink-0 grid-cols-7">
        {WEEKDAYS.map(d => (
          <div
            key={d}
            className="py-1 text-center text-[11px] font-medium text-dim uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div
        key={date}
        className={`grid min-h-0 flex-1 grid-cols-7 grid-rows-6 border-t border-l border-line ${slide}`}
      >
        {days.map(d => (
          <Cell
            key={d}
            date={d}
            entries={byDay.get(d)!}
            outside={d.slice(0, 7) !== month}
            isToday={d === today}
            lookups={lookups}
            onDayClick={onDayClick}
          />
        ))}
      </div>
    </div>
  );
}

interface CellProps {
  date: ISODate;
  entries: Entry[];
  outside: boolean;
  isToday: boolean;
  lookups: Lookups;
  onDayClick(d: ISODate): void;
}

const Cell = memo(function Cell({
  date,
  entries,
  outside,
  isToday,
  lookups,
  onDayClick,
}: CellProps) {
  const {setNodeRef, isOver} = useDroppable({id: `cell|${date}`});
  const hasDraft = useUi(s => s.draft?.date === date);
  const shown = entries.slice(0, MAX_ENTRIES);
  const more = entries.length - shown.length;
  return (
    <div
      ref={setNodeRef}
      onClick={e => {
        if (e.target !== e.currentTarget || clicksSuppressed()) return;
        useUi.getState().setDraft(draftAt(date, 9 * 60, 10 * 60, true));
      }}
      className={`drop-target flex min-h-0 cursor-pointer flex-col gap-px overflow-hidden border-r border-b border-line px-1 pb-1 hover:bg-raised/40 ${isOver ? 'is-over bg-accent/10' : ''} ${
        outside ? 'bg-raised/40' : ''
      }`}
    >
      <button
        onClick={() => onDayClick(date)}
        className={`mx-auto my-0.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums transition-colors duration-150 ${
          isToday
            ? 'bg-accent font-medium text-white'
            : outside
              ? 'text-dim hover:bg-raised'
              : 'text-strong hover:bg-raised'
        }`}
      >
        {Number(date.slice(8)) === 1
          ? new Intl.DateTimeFormat('en-GB', {
              day: 'numeric',
              month: 'short',
            }).format(new Date(date + 'T00:00'))
          : Number(date.slice(8))}
      </button>
      {shown.map(x =>
        x.kind === 'google' ? (
          <GoogleChip key={x.ev.key} ev={x.ev} variant="month" />
        ) : x.kind === 'event' ? (
          <EventChip key={x.event.id} event={x.event} />
        ) : (
          <AllocChip key={x.alloc.id} alloc={x.alloc} lookups={lookups} />
        ),
      )}
      {more > 0 && (
        <button
          className="rounded px-1 text-left text-[11px] font-medium text-dim hover:bg-raised"
          onClick={() => onDayClick(date)}
        >
          {more} more
        </button>
      )}
      {hasDraft && <DraftChip />}
    </div>
  );
});

const EventChip = memo(function EventChip({event}: {event: CalendarEvent}) {
  const open = useUi(s => s.openEventId === event.id);
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `event:${event.id}`,
    data: {kind: 'event', event} satisfies Entry,
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
          className={`block-interactive flex shrink-0 cursor-pointer touch-none items-center gap-1 truncate rounded px-1 text-[11px] ${isDragging ? 'opacity-30' : ''} ${
            event.allDay ? 'font-medium' : 'hover:bg-raised'
          }`}
          style={
            event.allDay
              ? {
                  background: 'var(--color-event)',
                  color: 'var(--color-on-block)',
                }
              : undefined
          }
        >
          {!event.allDay && (
            <>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{background: 'var(--color-event)'}}
              />
              <span className="text-dim tabular-nums">{event.start}</span>
            </>
          )}
          <span className="truncate">{event.title}</span>
        </div>
      </PopoverAnchor>
      {open && (
        <PopoverContent side="right" align="start">
          <EventEditor eventId={event.id} />
        </PopoverContent>
      )}
    </Popover>
  );
});

const AllocChip = memo(function AllocChip({
  alloc,
  lookups,
}: {
  alloc: Allocation;
  lookups: Lookups;
}) {
  const {attributes, listeners, setNodeRef, isDragging} = useDraggable({
    id: `alloc:${alloc.id}`,
    data: {kind: 'alloc', alloc} satisfies Entry,
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
      className={`block-interactive flex shrink-0 cursor-pointer touch-none items-center gap-1 truncate rounded border-l-4 px-1 text-[11px] ${isDragging ? 'opacity-30' : ''} ${
        alloc.done ? 'line-through opacity-60' : ''
      }`}
      style={{
        borderLeftColor: lookups.color(item),
        background: `color-mix(in srgb, ${lookups.color(item)} 22%, transparent)`,
      }}
    >
      {alloc.start && (
        <span className="text-dim tabular-nums">{alloc.start}</span>
      )}
      <span className="truncate">{item?.title}</span>
    </div>
  );
});

function DraftChip() {
  const title = useUi(s => s.draft?.title);
  return (
    <Popover open onOpenChange={o => !o && useUi.getState().setDraft(null)}>
      <PopoverAnchor asChild>
        <div
          className="shrink-0 animate-pop-in truncate rounded px-1 text-[11px] font-medium shadow-md"
          style={{
            background: 'var(--color-event)',
            color: 'var(--color-on-block)',
          }}
        >
          {title || '(No title)'}
        </div>
      </PopoverAnchor>
      <PopoverContent side="right" align="start">
        <DraftEditor />
      </PopoverContent>
    </Popover>
  );
}

function Ghost({entry}: {entry: Entry}) {
  const lookups = useLookups();
  const title =
    entry.kind === 'event'
      ? entry.event.title
      : entry.kind === 'google'
        ? entry.ev.title
        : (lookups.item(entry.alloc.itemId)?.title ?? '');
  return (
    <div className="w-36 animate-lift truncate rounded bg-raised px-1.5 py-0.5 text-[11px] shadow-xl ring-1 ring-accent/50">
      {title}
    </div>
  );
}
