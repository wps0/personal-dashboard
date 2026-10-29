/**
 * @fileoverview Repeating events: which dates they happen on, how they're
 * shown (one entry per occurrence), and how changing or deleting one
 * occurrence, the following ones or all of them reshapes the stored events.
 *
 * A repeating event is stored once, on its first date, with its rule and the
 * dates it skips. On the calendar each occurrence is a copy with that date
 * and the key `<id>@<date>`, so display code needs no special case; changes
 * go through `changeEvent` and `deleteEvent` here, which understand the keys.
 */

import * as pb from '../gen/dashboard/data_pb';
import {
  addDays,
  daysBetween,
  formatMedium,
  MONDAY,
  startOfWeek,
  weekdayIndex,
} from './dates';
import type {CalendarEvent, ISODate} from './types';

export type Recurrence = pb.Recurrence;
export type EventPatch = Partial<Omit<CalendarEvent, 'id' | '$typeName'>>;

/** What a change to a repeating event's occurrence applies to. */
export type Scope = 'this' | 'following' | 'all';

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** A weekday's name, e.g. "Wednesday". */
export function weekdayName(w: pb.Weekday): string {
  return DAY_NAMES[w - 1] ?? '';
}

/** A date's weekday, as stored in a recurrence. */
export function weekdayOf(date: ISODate): pb.Weekday {
  return (weekdayIndex(date) + 1) as pb.Weekday;
}

export const WORK_DAYS = [
  pb.Weekday.MONDAY,
  pb.Weekday.TUESDAY,
  pb.Weekday.WEDNESDAY,
  pb.Weekday.THURSDAY,
  pb.Weekday.FRIDAY,
];

/** The key of a repeating event's occurrence on `date`. */
export function occurrenceKey(id: string, date: ISODate): string {
  return `${id}@${date}`;
}

/** An event's id, and the date for an occurrence's key. */
export function parseKey(key: string): {id: string; date?: ISODate} {
  const at = key.lastIndexOf('@');
  return at < 0 ? {id: key} : {id: key.slice(0, at), date: key.slice(at + 1)};
}

function weekdays(r: Recurrence, start: ISODate): pb.Weekday[] {
  return r.weekdays.length ? r.weekdays : [weekdayOf(start)];
}

/** Whether a rule starting on `start` falls on `date` (skipped dates aside). */
function onRule(r: Recurrence, start: ISODate, date: ISODate): boolean {
  if (date < start || (r.until !== undefined && date > r.until)) return false;
  const every = Math.max(1, r.interval);
  switch (r.unit) {
    case pb.RecurrenceUnit.DAY:
      return daysBetween(start, date) % every === 0;
    case pb.RecurrenceUnit.WEEK: {
      if (!weekdays(r, start).includes(weekdayOf(date))) return false;
      const weeks =
        daysBetween(startOfWeek(start, MONDAY), startOfWeek(date, MONDAY)) / 7;
      return weeks % every === 0;
    }
    default:
      // A unit from a newer version: at least its first date.
      return date === start;
  }
}

/** Whether `e` happens on `date`. */
export function happensOn(e: CalendarEvent, date: ISODate): boolean {
  if (!e.recurrence) return e.date === date;
  return !e.skippedDates.includes(date) && onRule(e.recurrence, e.date, date);
}

function occurrence(e: CalendarEvent, date: ISODate): CalendarEvent {
  return {...e, id: occurrenceKey(e.id, date), date};
}

/**
 * The events shown on each of `days`: an event once, a repeating event once
 * per occurrence (keyed `<id>@<date>`).
 */
export function eventsByDay(
  events: CalendarEvent[],
  days: ISODate[],
): Map<ISODate, CalendarEvent[]> {
  const m = new Map<ISODate, CalendarEvent[]>(days.map(d => [d, []]));
  for (const e of events)
    for (const d of days)
      if (happensOn(e, d)) m.get(d)!.push(e.recurrence ? occurrence(e, d) : e);
  return m;
}

/** The event shown for `key`, if it still happens. */
export function shownEvent(
  events: CalendarEvent[],
  key: string,
): CalendarEvent | undefined {
  const {id, date} = parseKey(key);
  const e = events.find(x => x.id === id);
  if (!e?.recurrence) return e;
  const on = date ?? e.date;
  return happensOn(e, on) ? occurrence(e, on) : undefined;
}

/**
 * The date of the `n`th occurrence of a rule starting on `start` (the first
 * is `start` itself, if the rule falls on it). Looks up to ten years ahead.
 */
export function nthDate(r: Recurrence, start: ISODate, n: number): ISODate {
  const open = {...r, until: undefined};
  let last = start;
  let seen = 0;
  for (let d = start, i = 0; i < 3660 && seen < n; d = addDays(d, 1), i++)
    if (onRule(open, start, d)) {
      last = d;
      seen++;
    }
  return last;
}

/** A weekday list in words: "Monday", "Mon, Wed". */
function dayList(days: pb.Weekday[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.length === 1
    ? DAY_NAMES[sorted[0] - 1]
    : sorted.map(d => DAY_NAMES[d - 1].slice(0, 3)).join(', ');
}

/** The rule in words, e.g. "Weekly on Wednesday, until 20 Dec 2026". */
export function describeRecurrence(r: Recurrence, start: ISODate): string {
  const every = Math.max(1, r.interval);
  let text: string;
  if (r.unit === pb.RecurrenceUnit.WEEK) {
    const days = weekdays(r, start);
    const workDays =
      days.length === 5 && WORK_DAYS.every(d => days.includes(d));
    text =
      every === 1 && workDays
        ? 'Every weekday (Monday to Friday)'
        : every === 1
          ? `Weekly on ${dayList(days)}`
          : `Every ${every} weeks on ${dayList(days)}`;
  } else text = every === 1 ? 'Daily' : `Every ${every} days`;
  return r.until ? `${text}, until ${formatMedium(r.until)}` : text;
}

function replace(events: CalendarEvent[], e: CalendarEvent): CalendarEvent[] {
  return events.map(x => (x.id === e.id ? e : x));
}

/** `e` moved by `n` days: its first date, end, skipped dates and weekdays. */
function shifted(e: CalendarEvent, n: number): CalendarEvent {
  const r = e.recurrence!;
  return {
    ...e,
    date: addDays(e.date, n),
    skippedDates: e.skippedDates.map(d => addDays(d, n)),
    recurrence: {
      ...r,
      until: r.until === undefined ? undefined : addDays(r.until, n),
      weekdays: r.weekdays.map(w => ((((w - 1 + n) % 7) + 7) % 7) + 1),
    },
  };
}

/**
 * Repeating event `e` changed as seen on its occurrence `date`: moving that
 * occurrence moves every one; "doesn't repeat" leaves a single event there.
 */
function changeSeries(
  e: CalendarEvent,
  date: ISODate,
  patch: EventPatch,
): {event: CalendarEvent; key: string} {
  if ('recurrence' in patch && !patch.recurrence) {
    const once = {...e, ...patch, date: patch.date ?? date, skippedDates: []};
    return {event: once, key: once.id};
  }
  const n = patch.date === undefined ? 0 : daysBetween(date, patch.date);
  const rest: EventPatch = {...patch};
  delete rest.date;
  const event = {...(n ? shifted(e, n) : e), ...rest};
  return {event, key: occurrenceKey(event.id, addDays(date, n))};
}

/** `e`'s rule cut so its last occurrence is before `date`. */
function endedBefore(e: CalendarEvent, date: ISODate): CalendarEvent {
  return {
    ...e,
    recurrence: {...e.recurrence!, until: addDays(date, -1)},
    skippedDates: e.skippedDates.filter(d => d < date),
  };
}

/**
 * The events after changing the one shown as `key` by `patch`, and the key
 * the changed event is shown as now. For a repeating event's occurrence,
 * `scope` says which occurrences change: 'this' makes it an event of its own
 * (the repeating event skips that date), 'following' splits the repeating
 * event there, 'all' changes it as a whole.
 */
export function changeEvent(
  events: CalendarEvent[],
  key: string,
  scope: Scope,
  patch: EventPatch,
  newId: () => string,
): {events: CalendarEvent[]; key: string} {
  const {id, date} = parseKey(key);
  const e = events.find(x => x.id === id);
  if (!e) return {events, key};
  if (!e.recurrence || date === undefined) {
    const out = {...e, ...patch};
    return {
      events: replace(events, out),
      key: out.recurrence ? occurrenceKey(id, out.date) : id,
    };
  }
  if (scope === 'this' && !('recurrence' in patch)) {
    const own: CalendarEvent = {
      ...e,
      id: newId(),
      date,
      recurrence: undefined,
      skippedDates: [],
      seriesId: e.id,
      seriesDate: date,
      ...patch,
    };
    const skipping = {...e, skippedDates: [...e.skippedDates, date]};
    return {events: [...replace(events, skipping), own], key: own.id};
  }
  if (scope !== 'all' && date > e.date) {
    // From this date on, a repeating event of its own.
    const from: CalendarEvent = {
      ...e,
      id: newId(),
      date,
      skippedDates: e.skippedDates.filter(d => d >= date),
    };
    const changed = changeSeries(from, date, patch);
    const kept = replace(events, endedBefore(e, date)).map(x =>
      x.seriesId === id && x.date >= date ? {...x, seriesId: from.id} : x,
    );
    return {events: [...kept, changed.event], key: changed.key};
  }
  const changed = changeSeries(e, date, patch);
  return {events: replace(events, changed.event), key: changed.key};
}

/**
 * The events after giving an occurrence that was changed on its own (`key`)
 * back to its repeating event: the change is dropped and the repeating event
 * happens on that date again. Unchanged if it can't be (no repeating event).
 */
export function restoreOccurrence(
  events: CalendarEvent[],
  key: string,
): CalendarEvent[] {
  const own = events.find(x => x.id === key);
  const series = own?.seriesId
    ? events.find(x => x.id === own.seriesId && x.recurrence)
    : undefined;
  if (!own || !series || own.seriesDate === undefined) return events;
  const back = {
    ...series,
    skippedDates: series.skippedDates.filter(d => d !== own.seriesDate),
  };
  return replace(
    events.filter(x => x.id !== own.id),
    back,
  );
}

/**
 * The events after deleting the one shown as `key`; for a repeating event's
 * occurrence, that one ('this'), it and the following ones, or all of them
 * (with the occurrences changed on their own).
 */
export function deleteEvent(
  events: CalendarEvent[],
  key: string,
  scope: Scope,
): CalendarEvent[] {
  const {id, date} = parseKey(key);
  const e = events.find(x => x.id === id);
  if (!e) return events;
  if (!e.recurrence || date === undefined)
    return events.filter(x => x.id !== id);
  if (scope === 'this')
    return replace(events, {...e, skippedDates: [...e.skippedDates, date]});
  if (scope === 'following' && date > e.date)
    return replace(
      events.filter(x => !(x.seriesId === id && x.date >= date)),
      endedBefore(e, date),
    );
  return events.filter(x => x.id !== id && x.seriesId !== id);
}
