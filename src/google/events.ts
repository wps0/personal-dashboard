import {eventColorHex} from '../event_colors';
import {addDays, toISODate} from '../model/dates';
import type {ISODate} from '../model/types';

/** The parts of a Calendar API event we use (https://developers.google.com/calendar/api/v3/reference/events). */
export interface ApiEvent {
  id: string;
  /** The event's iCalendar UID, shared by all instances of a recurring event. */
  iCalUID?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  transparency?: 'opaque' | 'transparent';
  /** Per-event color ("1"–"11"), overriding the calendar's color. */
  colorId?: string;
  /** Guests; the entry with `self: true` is you (present when you're invited). */
  attendees?: {
    self?: boolean;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }[];
  eventType?: string;
  start: {date?: string; dateTime?: string};
  end: {date?: string; dateTime?: string};
}

export interface ApiCalendar {
  id: string;
  summary: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

/** A Google event as drawn on one day: multi-day events become one piece per day. Read-only. */
export interface GEvent {
  /** Unique per calendar, event instance and day. */
  key: string;
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  date: ISODate;
  /** The whole event's first and last day (pieces of one event share them). */
  first: ISODate;
  last: ISODate;
  allDay: boolean;
  /** Minutes since midnight on `date`; 0–1440. */
  startMin: number;
  endMin: number;
  /** The event's own colour, or its calendar's. */
  color: string;
  /** The calendar's colour, shown as a strip on all-day chips. */
  calendarColor: string;
  /** Blocks time for capacity (not marked "free" or declined, not an all-day or working-location entry). */
  busy: boolean;
  /** You declined this invitation: shown differently, never busy. */
  declined: boolean;
  /** The whole event's time, e.g. "Tue 14 Oct, 10:00 – 11:30" or "14 – 16 Oct". */
  when: string;
  htmlLink?: string;
  location?: string;
  description?: string;
}

function minutesOf(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}
function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
function dayOnly(s: ISODate) {
  // By parts: `${s}T00:00` is an invalid date past year 9999.
  const [y, m, d] = s.split('-').map(Number);
  return dayFmt.format(new Date(y, m - 1, d));
}

/** `a` before `b`, also past year 9999, where string order fails. */
function earlier(a: ISODate, b: ISODate) {
  return a.length === b.length ? a < b : a.length < b.length;
}

/** The days `first`…`last` inside `range` (all of them without one), or null if none. */
function clipDays(
  first: ISODate,
  last: ISODate,
  range?: {from: ISODate; to: ISODate},
): [ISODate, ISODate] | null {
  if (!range) return [first, last];
  const lo = earlier(first, range.from) ? range.from : first;
  const hi = earlier(range.to, last) ? range.to : last;
  return earlier(hi, lo) ? null : [lo, hi];
}

/**
 * Splits an API event into per-day pieces in local time, only on the days in
 * `range` if given (an event can span centuries). Cancelled events disappear.
 */
export function expandEvent(
  ev: ApiEvent,
  cal: ApiCalendar,
  range?: {from: ISODate; to: ISODate},
): GEvent[] {
  if (ev.status === 'cancelled') return [];
  const declined =
    ev.attendees?.some(a => a.self && a.responseStatus === 'declined') ?? false;
  const calendarColor = cal.backgroundColor || '#8ab4f8';
  const base = {
    declined,
    id: ev.id,
    calendarId: cal.id,
    calendarName: cal.summaryOverride ?? cal.summary,
    title: ev.summary?.trim() || '(No title)',
    color: (ev.colorId && eventColorHex(Number(ev.colorId))) || calendarColor,
    calendarColor,
    htmlLink: ev.htmlLink,
    location: ev.location,
    description: ev.description,
  };

  if (ev.start.date) {
    // All-day: the end date is exclusive.
    const first = ev.start.date;
    const last = ev.end.date ? addDays(ev.end.date, -1) : first;
    const when =
      first === last ? dayOnly(first) : `${dayOnly(first)} – ${dayOnly(last)}`;
    const out: GEvent[] = [];
    const days = clipDays(first, last, range);
    if (!days) return out;
    for (let d = days[0]; d <= days[1]; d = addDays(d, 1)) {
      out.push({
        ...base,
        key: `${cal.id}|${ev.id}|${d}`,
        date: d,
        first,
        last,
        allDay: true,
        startMin: 0,
        endMin: 1440,
        busy: false,
        when,
      });
    }
    return out;
  }

  if (!ev.start.dateTime || !ev.end.dateTime) return [];
  const s = new Date(ev.start.dateTime);
  const e = new Date(ev.end.dateTime);
  if (!(e > s)) return [];
  const first = toISODate(s);
  const last = toISODate(new Date(e.getTime() - 1)); // ends at midnight → previous day is the last
  const busy =
    !declined &&
    ev.transparency !== 'transparent' &&
    ev.eventType !== 'workingLocation';
  const when =
    first === last
      ? `${dayOnly(first)}, ${hhmm(s)} – ${hhmm(e)}`
      : `${dayOnly(first)} ${hhmm(s)} – ${dayOnly(toISODate(e))} ${hhmm(e)}`;
  const out: GEvent[] = [];
  const days = clipDays(first, last, range);
  if (!days) return out;
  for (let d = days[0]; d <= days[1]; d = addDays(d, 1)) {
    const startMin = d === first ? minutesOf(s) : 0;
    const endMin = d === toISODate(e) ? minutesOf(e) : 1440;
    out.push({
      ...base,
      key: `${cal.id}|${ev.id}|${d}`,
      date: d,
      first,
      last,
      allDay: false,
      startMin,
      endMin,
      busy,
      when,
    });
  }
  return out;
}

/** RFC 3339 bounds for local midnight at the start of `from` and after `to`. */
export function rangeBounds(
  from: ISODate,
  to: ISODate,
): {timeMin: string; timeMax: string} {
  const start = new Date(`${from}T00:00`);
  const end = new Date(`${addDays(to, 1)}T00:00`);
  return {timeMin: start.toISOString(), timeMax: end.toISOString()};
}
