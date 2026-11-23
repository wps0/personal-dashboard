/**
 * @fileoverview Dates as the log stores them: `YYYY-MM-DD` and `HH:MM`, in
 * local time.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `d` as YYYY-MM-DD, in local time. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local time of day of `d`. */
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today as YYYY-MM-DD, in local time. */
export function today(): string {
  return isoDate(new Date());
}

/** `date` (YYYY-MM-DD) moved by `days`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
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

/** "Sat 21 Nov", in English whatever the browser's language. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return `${DAYS[day]} ${d} ${MONTHS[m - 1]}`;
}

/** "Nov 2026"'s month name: "November". */
export function monthName(month: number): string {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][month];
}
