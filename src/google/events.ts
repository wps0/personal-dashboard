import {addDays, toISODate} from '../model/dates';
import type {ISODate} from '../model/types';

/** The parts of a Calendar API event we use (https://developers.google.com/calendar/api/v3/reference/events). */
export interface ApiEvent {
  id: string;
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
  allDay: boolean;
  /** Minutes since midnight on `date`; 0–1440. */
  startMin: number;
  endMin: number;
  color: string;
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

/**
 * Event colors as Google Calendar shows them (Lavender … Tomato). The API's own
 * /colors palette is an older, paler set that doesn't match what you see in the app.
 */
const EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb', // Lavender
  '2': '#33b679', // Sage
  '3': '#8e24aa', // Grape
  '4': '#e67c73', // Flamingo
  '5': '#f6bf26', // Banana
  '6': '#f4511e', // Tangerine
  '7': '#039be5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3f51b5', // Blueberry
  '10': '#0b8043', // Basil
  '11': '#d50000', // Tomato
};

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const dayOnly = (s: ISODate) => dayFmt.format(new Date(`${s}T00:00`));

/** Splits an API event into per-day pieces in local time. Cancelled events disappear. */
export function expandEvent(ev: ApiEvent, cal: ApiCalendar): GEvent[] {
  if (ev.status === 'cancelled') return [];
  const declined =
    ev.attendees?.some(a => a.self && a.responseStatus === 'declined') ?? false;
  const base = {
    declined,
    id: ev.id,
    calendarId: cal.id,
    calendarName: cal.summaryOverride ?? cal.summary,
    title: ev.summary?.trim() || '(No title)',
    color:
      (ev.colorId && EVENT_COLORS[ev.colorId]) ||
      cal.backgroundColor ||
      '#8ab4f8',
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
    for (let d = first; d <= last; d = addDays(d, 1)) {
      out.push({
        ...base,
        key: `${cal.id}|${ev.id}|${d}`,
        date: d,
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
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const startMin = d === first ? minutesOf(s) : 0;
    const endMin = d === toISODate(e) ? minutesOf(e) : 1440;
    out.push({
      ...base,
      key: `${cal.id}|${ev.id}|${d}`,
      date: d,
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
