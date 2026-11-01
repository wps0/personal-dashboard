/**
 * The work log (SPEC 3.10): stretches of time actually worked, the planned
 * work they're compared with (reserved time labelled as work), and weekly
 * targets.
 */
import {addDays} from './dates';
import {reservedByDay} from './reserved';
import {toMinutes} from './time';
import type {CalendarEvent, ISODate, Settings, WorkSpan} from './types';

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
 * The planned work on `date`: its reserved events named with the work label
 * (ignoring case), earliest first. Ones past midnight are left out.
 */
export function plannedWork(
  events: CalendarEvent[],
  date: ISODate,
  label: string,
): {start: string; end: string}[] {
  const want = (label.trim() || DEFAULT_WORK_LABEL).toLowerCase();
  return (reservedByDay(events, [date]).get(date) ?? [])
    .filter(s => !s.wraps && s.event.title.trim().toLowerCase() === want)
    .map(s => ({start: s.event.start, end: s.event.end}))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Hours of planned work in the week starting on `monday` on the days nothing
 * is logged yet: once a day has a stretch logged, its log replaces its plan.
 */
export function weekPlannedHours(
  log: WorkSpan[],
  events: CalendarEvent[],
  monday: ISODate,
  label: string,
): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    if (log.some(s => s.date === date)) continue;
    for (const p of plannedWork(events, date, label)) sum += spanHours(p);
  }
  return sum;
}
