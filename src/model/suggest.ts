/**
 * Suggested sessions (SPEC 3.5): a task's hours spread over the days before
 * its due date, backward from the deadline, into each day's free capacity.
 * Pure functions; the card is components/suggest_sessions.tsx.
 */
import {
  SUGGEST_DAYS_BACK,
  SUGGEST_SESSION_MAX_HOURS,
  SUGGEST_SESSION_MIN_HOURS,
  SUGGEST_STEP_MINUTES,
} from '../config';
import {plannedInWindow, type CapacityInfo} from './capacity';
import {addDays, daysBetween} from './dates';
import {toMinutes} from './time';
import type {Allocation, ISODate} from './types';

/** A suggested session: untimed, `hours` long on `date`. */
export interface Suggestion {
  date: ISODate;
  hours: number;
}

export interface Spread {
  /** In date order. */
  sessions: Suggestion[];
  /** The hours that didn't fit. */
  short: number;
}

/**
 * The days a task due on `due` can be spread over: from today, or from
 * SUGGEST_DAYS_BACK before the due date if that's later, to the day before
 * it (on the day itself it's due). None when it's due today or earlier.
 */
export function spreadDays(due: ISODate, today: ISODate): ISODate[] {
  const back = addDays(due, -SUGGEST_DAYS_BACK);
  const first = back > today ? back : today;
  return Array.from({length: Math.max(0, daysBetween(first, due))}, (_, i) =>
    addDays(first, i),
  );
}

/**
 * A day's free planning time, in whole steps of SUGGEST_STEP_MINUTES: its
 * capacity less what's planned on it (`allocs`, every task's). Given `now`
 * (minutes after midnight, for today), no more than what's left of its
 * planning window.
 */
export function freeMinutes(
  capacity: CapacityInfo,
  allocs: Allocation[],
  now?: number,
): number {
  let free = (capacity.total - plannedInWindow(allocs, capacity)) * 60;
  if (now !== undefined)
    free = Math.min(free, toMinutes(capacity.window.end) - now);
  const step = SUGGEST_STEP_MINUTES;
  return Math.max(0, Math.floor(free / step + 1e-9) * step);
}

/**
 * Spreads `hours` backward from the deadline over the days of `free` (free
 * minutes per day, in date order, the last day just before the deadline).
 * Each day, the latest first, gets a session of the same length, at most
 * SUGGEST_SESSION_MAX_HOURS, as far as its free time allows; a day without
 * room for SUGGEST_SESSION_MIN_HOURS is skipped. If that isn't enough, the
 * free time left is filled, again the latest days first.
 */
export function spreadBackward(
  hours: number,
  free: ReadonlyMap<ISODate, number>,
): Spread {
  let left = Math.round(hours * 60);
  const given = new Map<ISODate, number>();
  if (left > 0) {
    const step = SUGGEST_STEP_MINUTES;
    const min = SUGGEST_SESSION_MIN_HOURS * 60;
    const max = SUGGEST_SESSION_MAX_HOURS * 60;
    // About equal sessions: 5h is 1h 45m + 1h 45m + 1h 30m, not 2h + 2h + 1h.
    const length = Math.ceil(left / Math.ceil(left / max) / step) * step;
    const latestFirst = [...free.keys()].reverse();
    for (const limit of [length, Infinity]) {
      for (const day of latestFirst) {
        if (left <= 0) break;
        const has = given.get(day) ?? 0;
        const give = Math.min(limit - has, free.get(day)! - has, left);
        // A new session is long enough to be worth it, or the last bit.
        if (give <= 0 || (!has && give < min && give < left)) continue;
        given.set(day, has + give);
        left -= give;
      }
    }
  }
  return {
    sessions: [...given]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, minutes]) => ({date, hours: minutes / 60})),
    short: Math.max(0, left) / 60,
  };
}
