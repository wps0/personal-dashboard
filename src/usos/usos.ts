/**
 * USOSweb timetable → course tasks (SPEC 4.2). Pure functions: parsing a
 * timetable (iCal text or Google Calendar events), recognising class titles
 * like "WYK - Implementacja systemów operacyjnych", and matching them to
 * course projects by a pattern on the course title.
 */
import type {ApiEvent} from '../google/events';
import {dayName, shortDate, toISODate} from '../model/dates';
import {ItemKind, type ISODate, type Item} from '../model/types';

/** One class meeting from the timetable. */
export interface ClassMeeting {
  /** Stable across sources and syncs: the iCal UID plus the start. */
  key: string;
  /** Class type designator, e.g. "WYK", "LAB", "CW", "SEM-MGR". */
  type: string;
  /** The course title, without the type designator. */
  course: string;
  date: ISODate;
  /** `HH:MM`, local time. */
  start: string;
  end: string;
  location?: string;
}

/**
 * Splits a USOS class title into its type designator and course title:
 * "SEM-MGR - Dane, strumienie, rozpraszanie" → {type: "SEM-MGR", course:
 * "Dane, strumienie, rozpraszanie"}. Null for titles of another shape.
 */
export function parseClassTitle(
  title: string,
): {type: string; course: string} | null {
  const m =
    /^\s*(\p{Lu}[\p{Lu}\d]*(?:-[\p{Lu}\d]+)*)\s+[-–—]\s+(.+?)\s*$/u.exec(title);
  return m ? {type: m[1], course: m[2]} : null;
}

/**
 * Compiles a project's course pattern: a regular expression, case-insensitive,
 * tested against the course title only (never the type designator). Throws
 * a readable error for an invalid pattern.
 */
export function coursePattern(source: string): RegExp {
  try {
    return new RegExp(source, 'iu');
  } catch (e) {
    throw new Error(`Invalid pattern: ${(e as Error).message}`, {cause: e});
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function meeting(
  uid: string,
  title: string,
  start: Date,
  end: Date,
  location?: string,
): ClassMeeting | null {
  const parsed = parseClassTitle(title);
  if (!parsed) return null;
  const date = toISODate(start);
  const startTime = hhmm(start);
  return {
    key: `${uid}@${date}T${startTime}`,
    ...parsed,
    date,
    start: startTime,
    end: toISODate(end) === date ? hhmm(end) : '23:59',
    location: location || undefined,
  };
}

/** Class meetings from Google Calendar events (a calendar subscribed to the USOS feed). */
export function meetingsFromGoogle(events: ApiEvent[]): ClassMeeting[] {
  const out: ClassMeeting[] = [];
  for (const ev of events) {
    if (ev.status === 'cancelled' || !ev.start.dateTime || !ev.end.dateTime)
      continue;
    const m = meeting(
      ev.iCalUID ?? ev.id,
      ev.summary ?? '',
      new Date(ev.start.dateTime),
      new Date(ev.end.dateTime),
      ev.location,
    );
    if (m) out.push(m);
  }
  return out;
}

// iCalendar (RFC 5545), the subset a timetable export uses.

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(text: string): string[] {
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseProp(line: string): Prop | null {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (colon < 0) return null;
  const [name, ...params] = line.slice(0, colon).split(';');
  const p: Record<string, string> = {};
  for (const kv of params) {
    const eq = kv.indexOf('=');
    if (eq > 0)
      p[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1).replace(/"/g, '');
  }
  return {name: name.toUpperCase(), params: p, value: line.slice(colon + 1)};
}

const unescapeText = (v: string) =>
  v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Minutes to add to UTC to get the wall-clock time in `tz` at instant `ms`. */
function tzOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (wall - ms) / 60_000;
}

/** A DATE-TIME value (UTC "Z", with a TZID, or floating local time) as a Date. */
function parseDateTime(value: string, tzid?: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (m[7]) return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (tzid) {
    try {
      const guess = Date.UTC(y, mo - 1, d, h, mi, s);
      let t = guess - tzOffset(guess, tzid) * 60_000;
      t = guess - tzOffset(t, tzid) * 60_000; // settle across a DST change
      return new Date(t);
    } catch {
      // Unknown TZID: treat as local time.
    }
  }
  return new Date(y, mo - 1, d, h, mi, s);
}

/** Start times of a weekly RRULE (the only kind timetables use), or null if unsupported. */
function weeklyStarts(
  rrule: string,
  first: Date,
  exdates: Set<number>,
): Date[] | null {
  const r = Object.fromEntries(
    rrule.split(';').map(kv => kv.split('=') as [string, string]),
  );
  if (r.FREQ !== 'WEEKLY' || r.BYDAY?.includes(',')) return null;
  const interval = Number(r.INTERVAL ?? 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL
    ? parseDateTime(r.UNTIL.length === 8 ? `${r.UNTIL}T235959` : r.UNTIL)
    : null;
  const out: Date[] = [];
  for (let i = 0; out.length < count && i < 520; i++) {
    // Step by calendar days so the wall-clock time survives DST changes.
    const t = new Date(first);
    t.setDate(first.getDate() + i * 7 * interval);
    if (until && t > until) break;
    out.push(t);
  }
  // EXDATEs are removed after COUNT is applied (RFC 5545).
  return out.filter(t => !exdates.has(t.getTime()));
}

/** Class meetings from an iCalendar (.ics) timetable, plus warnings about what was skipped. */
export function meetingsFromICal(text: string): {
  meetings: ClassMeeting[];
  warnings: string[];
} {
  const meetings: ClassMeeting[] = [];
  const warnings: string[] = [];
  let ev: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') ev = [];
    else if (line === 'END:VEVENT' && ev) {
      const one = (n: string) => ev!.find(p => p.name === n);
      const uid = one('UID')?.value ?? '';
      const title = unescapeText(one('SUMMARY')?.value ?? '');
      const ds = one('DTSTART');
      const de = one('DTEND');
      const start = ds && parseDateTime(ds.value, ds.params.TZID);
      const end = de ? parseDateTime(de.value, de.params.TZID) : start;
      const location = unescapeText(one('LOCATION')?.value ?? '');
      if (one('STATUS')?.value === 'CANCELLED' || !start || !end) {
        ev = null;
        continue;
      }
      const length = end.getTime() - start.getTime();
      const rrule = one('RRULE')?.value;
      let starts = [start];
      if (rrule) {
        const ex = new Set(
          ev
            .filter(p => p.name === 'EXDATE')
            .flatMap(p =>
              p.value
                .split(',')
                .map(v => parseDateTime(v, p.params.TZID)?.getTime() ?? NaN),
            ),
        );
        const expanded = weeklyStarts(rrule, start, ex);
        if (expanded) starts = expanded;
        else
          warnings.push(
            `“${title}”: repeat rule not supported (${rrule}); only its first class is used.`,
          );
      }
      for (const s of starts) {
        const m = meeting(
          uid,
          title,
          s,
          new Date(s.getTime() + length),
          location,
        );
        if (m) meetings.push(m);
      }
      ev = null;
    } else if (ev) {
      const p = parseProp(line);
      if (p) ev.push(p);
    }
  }
  if (!meetings.length && !/BEGIN:VCALENDAR/.test(text))
    warnings.push('This doesn’t look like an iCalendar (.ics) file.');
  return {meetings, warnings};
}

export interface CourseRule {
  projectId: string;
  /** Regular expression on the course title (see coursePattern). */
  pattern: string;
}

export interface Proposal {
  projectId: string;
  meeting: ClassMeeting;
}

/**
 * New class meetings to offer for import: each meeting goes to the first
 * project whose pattern matches its course title, unless it was imported
 * before (by key). Meetings that match no project are left out; invalid
 * patterns are skipped (the project shows the error).
 */
export function proposeImports(
  meetings: ClassMeeting[],
  rules: CourseRule[],
  importedKeys: ReadonlySet<string>,
): Proposal[] {
  const compiled = rules.flatMap(r => {
    try {
      return r.pattern.trim()
        ? [{projectId: r.projectId, re: coursePattern(r.pattern)}]
        : [];
    } catch {
      return [];
    }
  });
  const seen = new Set<string>();
  const out: Proposal[] = [];
  for (const m of [...meetings].sort((a, b) =>
    (a.date + a.start).localeCompare(b.date + b.start),
  )) {
    if (importedKeys.has(m.key) || seen.has(m.key)) continue;
    seen.add(m.key);
    const rule = compiled.find(r => r.re.test(m.course));
    if (rule) out.push({projectId: rule.projectId, meeting: m});
  }
  return out;
}

/** Title for the task made from a class meeting, e.g. "WYK · Wed 14 Oct, 10:15". */
export function meetingTitle(m: ClassMeeting): string {
  // The app's own formatting, so titles don't depend on the browser's locale data.
  return `${m.type} · ${dayName(m.date)} ${shortDate(m.date)}, ${m.start}`;
}

/**
 * The task made from a class meeting: a class item, dated by the class,
 * remembering which meeting it came from.
 */
export function taskFromMeeting(
  m: ClassMeeting,
): Partial<Omit<Item, 'id' | 'projectId'>> {
  return {
    kind: ItemKind.CLASS,
    title: meetingTitle(m),
    heldOn: m.date,
    notes: [`${m.type} ${m.start}–${m.end}`, m.location]
      .filter(Boolean)
      .join(' · '),
    source: {source: {case: 'usosMeeting', value: m.key}},
  };
}
