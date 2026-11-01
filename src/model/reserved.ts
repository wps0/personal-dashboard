/**
 * @fileoverview Reserved time (sleep, work): reserved events, drawn hatched
 * on the calendar. Like events, they take capacity inside the planning
 * window. Unlike other events, one may end after midnight (an end before its
 * start), so it's drawn on two days.
 */

import * as pb from '../gen/dashboard/data_pb';
import {addDays} from './dates';
import {eventsByDay} from './recurrence';
import {toMinutes} from './time';
import type {CalendarEvent, ISODate} from './types';

const DAY_MIN = 24 * 60;

export function isReserved(e: CalendarEvent): boolean {
  return e.kind === pb.EventKind.RESERVED;
}

/** A reserved event's piece on one day, in minutes. */
export interface ReservedSpan {
  /** The event as shown (see model/recurrence): its occurrence's key. */
  key: string;
  event: CalendarEvent;
  start: number;
  end: number;
  /** It runs past midnight: drawn at both ends, edited in its card only. */
  wraps: boolean;
  /** The part after midnight, on the day after its date. */
  tail: boolean;
}

/** The reserved pieces drawn on each of `days` (consecutive). */
export function reservedByDay(
  events: CalendarEvent[],
  days: ISODate[],
): Map<ISODate, ReservedSpan[]> {
  const m = new Map<ISODate, ReservedSpan[]>(days.map(d => [d, []]));
  if (!days.length) return m;
  const reserved = events.filter(isReserved);
  // The day before too: its events past midnight end on the first day.
  const shown = eventsByDay(reserved, [addDays(days[0], -1), ...days]);
  for (const [d, list] of shown)
    for (const event of list) {
      const start = toMinutes(event.start);
      const end = toMinutes(event.end);
      const piece = {key: event.id, event, start, end, wraps: false};
      if (end > start) {
        m.get(d)?.push({...piece, tail: false});
        continue;
      }
      if (end === start) continue;
      m.get(d)?.push({...piece, end: DAY_MIN, wraps: true, tail: false});
      if (end > 0)
        m.get(addDays(d, 1))?.push({
          ...piece,
          start: 0,
          wraps: true,
          tail: true,
        });
    }
  return m;
}
