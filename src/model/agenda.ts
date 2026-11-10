/**
 * @fileoverview A day as an agenda, for Today on phones (views/today_view.tsx):
 * what's on at a set time in time order, what's all day, and the sessions
 * planned without a time.
 */
import type {GEvent} from '../google/events';
import {eventsByDay} from './recurrence';
import {isReserved, reservedByDay, type ReservedSpan} from './reserved';
import {toMinutes} from './time';
import type {Allocation, CalendarEvent, ISODate} from './types';

/** Something at a set time; `start` and `end` in minutes after midnight. */
export type AgendaEntry = {start: number; end: number} & (
  | {kind: 'event'; event: CalendarEvent}
  | {kind: 'google'; event: GEvent}
  | {kind: 'reserved'; span: ReservedSpan}
  | {kind: 'session'; alloc: Allocation}
);

export interface DayAgenda {
  /** Events without a time of day. */
  allDay: CalendarEvent[];
  googleAllDay: GEvent[];
  /** In time order; at the same time, the longer one first. */
  timed: AgendaEntry[];
  /** Sessions planned for the day, not for a time. */
  untimed: Allocation[];
}

/**
 * The agenda of `day`. Reserved time shows only when it's within the day
 * (work, the gym): a piece of one past midnight (sleep) says nothing a
 * list needs.
 */
export function dayAgenda(
  day: ISODate,
  {
    events,
    allocations,
    google = [],
  }: {
    events: CalendarEvent[];
    allocations: Allocation[];
    /** That day's Google events. */
    google?: GEvent[];
  },
): DayAgenda {
  const timed: AgendaEntry[] = [];
  const allDay: CalendarEvent[] = [];
  const own = eventsByDay(
    events.filter(e => !isReserved(e)),
    [day],
  ).get(day)!;
  for (const event of own)
    if (event.allDay) allDay.push(event);
    else
      timed.push({
        kind: 'event',
        start: toMinutes(event.start),
        end: toMinutes(event.end),
        event,
      });
  for (const span of reservedByDay(events, [day]).get(day)!)
    if (!span.wraps)
      timed.push({kind: 'reserved', start: span.start, end: span.end, span});
  for (const event of google)
    if (!event.allDay)
      timed.push({
        kind: 'google',
        start: event.startMin,
        end: event.endMin,
        event,
      });
  const untimed: Allocation[] = [];
  for (const alloc of allocations) {
    if (alloc.date !== day) continue;
    if (!alloc.start) {
      untimed.push(alloc);
      continue;
    }
    const start = toMinutes(alloc.start);
    timed.push({
      kind: 'session',
      start,
      end: start + Math.round(alloc.plannedHours * 60),
      alloc,
    });
  }
  timed.sort((a, b) => a.start - b.start || b.end - a.end);
  return {
    allDay,
    googleAllDay: google.filter(e => e.allDay),
    timed,
    untimed,
  };
}

/**
 * Where the line for now goes among `timed`: the index of the first entry
 * still to start, or their number when all have started.
 */
export function nowPosition(
  timed: readonly AgendaEntry[],
  now: number,
): number {
  const next = timed.findIndex(e => e.start > now);
  return next === -1 ? timed.length : next;
}
