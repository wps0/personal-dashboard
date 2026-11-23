/**
 * @fileoverview Dates as the log stores them: `YYYY-MM-DD` and `HH:MM`, in
 * local time.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The local date of `d`. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local time of day of `d`. */
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today's local date. */
export function today(): string {
  return isoDate(new Date());
}
