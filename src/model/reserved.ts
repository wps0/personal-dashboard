/**
 * @fileoverview Reserved time (sleep, work): reserved events, drawn hatched
 * on the calendar. Like events, they take capacity inside the planning
 * window. Unlike other events, one may end after midnight (an end before its
 * start), so it's drawn on two days.
 */

import * as pb from '../gen/dashboard/data_pb';
import {addDays, daysBetween} from './dates';
import {eventsByDay} from './recurrence';
import {endMinutes, fromMinutes, MIDNIGHT_END, toMinutes} from './time';
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
  /** It runs past midnight: drawn at the end of its day and the start of the next. */
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
      const end = endMinutes(event.end);
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

/** A reserved event's new day and times, to store. */
export interface ReservedTimes {
  date: ISODate;
  start: string;
  end: string;
}

/** A reserved event's length in minutes; one past midnight ends the next day. */
export function reservedLength(event: CalendarEvent): number {
  const start = toMinutes(event.start);
  const end = endMinutes(event.end);
  return end > start ? end - start : end + DAY_MIN - start;
}

/**
 * Times that start `start` minutes from the beginning of `date` (a day or
 * more after it, or before it, moves the date) and last `length`: an end
 * past midnight is stored before the start, on the next day.
 */
function timesFrom(
  date: ISODate,
  start: number,
  length: number,
): ReservedTimes {
  const days = Math.floor(start / DAY_MIN);
  const from = start - days * DAY_MIN;
  const to = from + length;
  return {
    date: addDays(date, days),
    start: fromMinutes(from),
    end:
      to < DAY_MIN
        ? fromMinutes(to)
        : to === DAY_MIN
          ? MIDNIGHT_END
          : fromMinutes(to - DAY_MIN),
  };
}

/** The day a reserved piece is drawn on: its event's, or the next one for the part after midnight. */
function pieceDate(span: ReservedSpan): ISODate {
  return span.tail ? addDays(span.event.date, 1) : span.event.date;
}

/**
 * The event of `span` moved so that this piece starts at minute `to` of
 * `date`: the whole event moves by as much (the part after midnight takes
 * the evening along), keeping its length. It may run past midnight now, or
 * no longer.
 */
export function movedReserved(
  span: ReservedSpan,
  date: ISODate,
  to: number,
): ReservedTimes {
  const moved = daysBetween(pieceDate(span), date) * DAY_MIN + to - span.start;
  return timesFrom(
    span.event.date,
    toMinutes(span.event.start) + moved,
    reservedLength(span.event),
  );
}

/**
 * How far each edge of a piece can be dragged, in minutes of its day. On an
 * event past midnight, the edges at midnight move too: the evening's bottom
 * up (it ends that evening then), the morning's top down (it starts that
 * morning). Its outer edges keep it under a day long.
 */
export function edgeLimits(span: ReservedSpan): {
  start: [number, number];
  end: [number, number];
} {
  const start = toMinutes(span.event.start);
  const end = endMinutes(span.event.end);
  if (!span.wraps) return {start: [0, end - 15], end: [start + 15, DAY_MIN]};
  if (!span.tail)
    return {
      start: [end + 15, Math.min(DAY_MIN, DAY_MIN - 15 + end)],
      end: [start + 15, DAY_MIN],
    };
  return {start: [0, end - 15], end: [0, start - 15]};
}

/**
 * The event of `span` with the piece's `edge` dragged to minute `to` of the
 * piece's day (within edgeLimits). Dragged off midnight, the edge between an
 * event's two pieces ends it, or starts it, on that piece's day; the
 * evening's top dragged down to midnight starts it the next day.
 */
export function resizedReserved(
  span: ReservedSpan,
  edge: 'start' | 'end',
  to: number,
): ReservedTimes {
  const [lo, hi] = edgeLimits(span)[edge];
  const at = Math.max(lo, Math.min(hi, to));
  const {date, start, end} = span.event;
  const next = addDays(date, 1);
  const time = (m: number) => (m === DAY_MIN ? MIDNIGHT_END : fromMinutes(m));
  if (!span.wraps)
    return edge === 'start'
      ? {date, start: fromMinutes(at), end}
      : {date, start, end: time(at)};
  if (!span.tail) {
    if (edge === 'end')
      // Up from midnight: it ends that evening.
      return at === DAY_MIN ? {date, start, end} : {date, start, end: time(at)};
    // Down to midnight: it starts the next day, at 00:00.
    return at === DAY_MIN
      ? {date: next, start: '00:00', end}
      : {date, start: fromMinutes(at), end};
  }
  if (edge === 'start')
    // Down from midnight: it starts that morning.
    return at === 0
      ? {date, start, end}
      : {date: next, start: fromMinutes(at), end};
  // Up to midnight: it ends the evening before, at 00:00.
  return at === 0
    ? {date, start, end: MIDNIGHT_END}
    : {date, start, end: fromMinutes(at)};
}
