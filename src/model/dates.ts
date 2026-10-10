import type { ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses `YYYY-MM-DD` as local midnight (not UTC, unlike `new Date(s)`). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday=0 … Sunday=6. */
export function weekdayIndex(s: ISODate): number {
  return (parseISODate(s).getDay() + 6) % 7;
}

/** The Monday of the week containing `s`. */
export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -weekdayIndex(s));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayName(s: ISODate): string {
  return DAY_NAMES[weekdayIndex(s)];
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
  return Math.floor(daysBetween(`${thursday.slice(0, 4)}-01-01`, thursday) / 7) + 1;
}
