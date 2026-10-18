import type {ISODate} from './types';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `YYYY-MM-DD` as local midnight (not UTC, unlike `new Date(s)`). */
function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A real calendar date as `YYYY-MM-DD` (not e.g. 2026-02-30 or month 13). */
export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && toISODate(parseISODate(s)) === s;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** A day of the week as `Date.getDay()` numbers it: Sunday=0 … Saturday=6. */
export type DayOfWeek = number;

/** The week journal's first day, whatever the setting. */
export const MONDAY: DayOfWeek = 1;

/** Monday=0 … Sunday=6 (capacity rules list weekdays Monday first). */
export function weekdayIndex(s: ISODate): number {
  return (parseISODate(s).getDay() + 6) % 7;
}

/** The first day of the week containing `s`, for weeks starting on `weekStart`. */
export function startOfWeek(s: ISODate, weekStart: DayOfWeek): ISODate {
  return addDays(s, -((parseISODate(s).getDay() - weekStart + 7) % 7));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round(
    (parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000,
  );
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function dayName(s: ISODate): string {
  return DAY_NAMES[weekdayIndex(s)];
}

/** Short day names in week order, for weeks starting on `weekStart`. */
export function weekdayNames(weekStart: DayOfWeek): string[] {
  return Array.from({length: 7}, (_, i) => DAY_NAMES[(weekStart + i + 6) % 7]);
}

/** e.g. "12 Oct". */
export function shortDate(s: ISODate): string {
  const d = parseISODate(s);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Human countdown: "today", "in 3d", "2d ago". */
export function countdown(due: ISODate, today: ISODate): string {
  const n = daysBetween(today, due);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 0) return `in ${n}d`;
  return `${-n}d ago`;
}

/** ISO-8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(s: ISODate): number {
  const thursday = addDays(s, 3 - weekdayIndex(s));
  return (
    Math.floor(daysBetween(`${thursday.slice(0, 4)}-01-01`, thursday) / 7) + 1
  );
}

/**
 * The number shown for the week starting on `start`: the ISO week of its
 * middle (fourth) day, which is the ISO week holding most of its days. For a
 * Monday start that's the Thursday, so exactly the ISO week; for a Sunday
 * start, the Wednesday.
 */
export function weekNumber(start: ISODate): number {
  return isoWeek(addDays(start, 3));
}

function fmt(opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-GB', opts);
}
const LONG = fmt({weekday: 'long', day: 'numeric', month: 'long'});
const MEDIUM = fmt({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const MONTH_YEAR = fmt({month: 'long', year: 'numeric'});

/** "Tuesday 14 October". */
export function formatLong(s: ISODate) {
  return LONG.format(parseISODate(s));
}
/** "Tue 14 Oct 2026". */
export function formatMedium(s: ISODate) {
  return MEDIUM.format(parseISODate(s));
}
/** "October 2026". */
export function formatMonthYear(s: ISODate) {
  return MONTH_YEAR.format(parseISODate(s));
}

export function firstOfMonth(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISODate(firstOfMonth(s));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

/** The 6×7 grid of dates shown for the month containing `s`, weeks starting on `weekStart`. */
export function monthGrid(s: ISODate, weekStart: DayOfWeek): ISODate[] {
  const start = startOfWeek(firstOfMonth(s), weekStart);
  return Array.from({length: 42}, (_, i) => addDays(start, i));
}
