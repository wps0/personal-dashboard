/**
 * The work log (SPEC 3.10): stretches of time actually worked, the planned
 * work they're compared with (reserved time labelled as work), and weekly
 * targets.
 */
import {reservedRanges, type CapacityRule, type DayCapacity} from './capacity';
import {addDays} from './dates';
import {toMinutes} from './time';
import type {ISODate, Settings, WorkSpan} from './types';

/** The label of reserved time that counts as planned work, unless set. */
export const DEFAULT_WORK_LABEL = 'Work';

/** Hours in a stretch of work. */
export function spanHours(s: Pick<WorkSpan, 'start' | 'end'>): number {
  return Math.max(0, toMinutes(s.end) - toMinutes(s.start)) / 60;
}

/** The stretches logged on `date`, earliest first. */
export function spansOn(log: WorkSpan[], date: ISODate): WorkSpan[] {
  return log
    .filter(s => s.date === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Hours logged from `from` to `to`, both included. */
export function loggedHours(
  log: WorkSpan[],
  from: ISODate,
  to: ISODate,
): number {
  return log
    .filter(s => s.date >= from && s.date <= to)
    .reduce((sum, s) => sum + spanHours(s), 0);
}

/** Hours logged in the week starting on `monday`. */
export function weekHours(log: WorkSpan[], monday: ISODate): number {
  return loggedHours(log, monday, addDays(monday, 6));
}

/** The week's target in hours: its own, if set, else the default; 0 for none. */
export function weekTarget(
  settings: Pick<Settings, 'workTarget' | 'weekWorkTargets'>,
  monday: ISODate,
): number {
  return settings.weekWorkTargets[monday] ?? settings.workTarget;
}

/**
 * The planned work on `date`: its reserved ranges with the work label
 * (ignoring case), earliest first. Ranges past midnight are left out.
 */
export function plannedWork(
  rules: CapacityRule[],
  days: Record<ISODate, DayCapacity>,
  date: ISODate,
  label: string,
): {start: string; end: string}[] {
  const want = (label.trim() || DEFAULT_WORK_LABEL).toLowerCase();
  return reservedRanges(rules, days, date)
    .filter(
      r =>
        (r.label ?? '').trim().toLowerCase() === want &&
        toMinutes(r.end) > toMinutes(r.start),
    )
    .map(r => ({start: r.start, end: r.end}))
    .sort((a, b) => a.start.localeCompare(b.start));
}
