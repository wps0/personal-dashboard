import {listEvents} from '../google/api';
import {addDays, todayISO} from '../model/dates';
import type {ISODate, UsosSource} from '../model/types';
import {meetingsFromGoogle, meetingsFromICal, type ClassMeeting} from './usos';

/**
 * Which classes are considered: about a semester back (lectures to catch up
 * on) and half a year ahead.
 */
export function usosRange(today: ISODate = todayISO()) {
  return {from: addDays(today, -120), to: addDays(today, 180)};
}

/** Only https links: the link carries a personal token. */
export function isValidICalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A timetable is a few hundred kB; anything much bigger is the wrong link. */
const MAX_ICAL_BYTES = 5_000_000;

/** Class meetings from the configured source, plus warnings about anything skipped. */
export async function fetchMeetings(
  source: UsosSource,
): Promise<{meetings: ClassMeeting[]; warnings: string[]}> {
  const {from, to} = usosRange();
  switch (source.case) {
    case 'googleCalendarId': {
      const events = await listEvents(
        source.value,
        new Date(`${from}T00:00`).toISOString(),
        new Date(`${addDays(to, 1)}T00:00`).toISOString(),
      );
      return {meetings: meetingsFromGoogle(events), warnings: []};
    }
    case 'icalUrl':
      return fetchICal(source.value);
    default:
      throw new Error('No timetable source is set.');
  }
}

async function fetchICal(
  url: string,
): Promise<{meetings: ClassMeeting[]; warnings: string[]}> {
  if (!isValidICalUrl(url))
    throw new Error('The iCal link must start with https://.');
  const {from, to} = usosRange();
  let res: Response;
  try {
    // No cookies or referrer: the link itself is the credential.
    res = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'Couldn’t load the iCal link: you’re offline, or its server doesn’t allow requests from this site (CORS).',
    );
  }
  if (!res.ok)
    throw new Error(
      `The iCal link returned ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`,
    );
  const {meetings, warnings} = meetingsFromICal(await readLimited(res));
  return {
    meetings: meetings.filter(m => m.date >= from && m.date <= to),
    warnings,
  };
}

/** The body as text, refusing one over MAX_ICAL_BYTES without reading it all. */
async function readLimited(res: Response): Promise<string> {
  const tooLarge = () =>
    new Error(
      `The iCal link returned more than ${MAX_ICAL_BYTES / 1_000_000} MB, too much for a timetable: check the link.`,
    );
  if (Number(res.headers.get('Content-Length')) > MAX_ICAL_BYTES)
    throw tooLarge();
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ICAL_BYTES) {
      void reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return new Blob(chunks).text();
}

/** Courses found in a timetable, with their class types and number of meetings. */
export function coursesIn(
  meetings: ClassMeeting[],
): {course: string; types: string[]; count: number}[] {
  const by = new Map<string, {types: Set<string>; count: number}>();
  for (const m of meetings) {
    const c = by.get(m.course) ?? {types: new Set(), count: 0};
    c.types.add(m.type);
    c.count++;
    by.set(m.course, c);
  }
  return [...by]
    .map(([course, c]) => ({
      course,
      types: [...c.types].sort(),
      count: c.count,
    }))
    .sort((a, b) => a.course.localeCompare(b.course));
}
