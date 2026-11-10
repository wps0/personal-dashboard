/**
 * The work log (SPEC 3.10): stretches of time actually worked, the planned
 * work they're compared with (reserved time labelled as work), and weekly
 * targets.
 */
import {addDays, MONDAY, startOfWeek} from './dates';
import {reservedByDay} from './reserved';
import {toMinutes} from './time';
import type {CalendarEvent, ISODate, Settings, WorkSpan} from './types';

/** The label of reserved time that counts as planned work, unless set. */
export const DEFAULT_WORK_LABEL = 'Work';

/** Whether `s` logs hours alone, without a time of day. */
export function isHoursOnly(
  s: Pick<WorkSpan, 'hours'>,
): s is Pick<WorkSpan, 'hours'> & {hours: number} {
  return s.hours !== undefined;
}

/** Hours in a stretch of work, or the hours logged alone. */
export function spanHours(
  s: Pick<WorkSpan, 'start' | 'end' | 'hours'>,
): number {
  if (isHoursOnly(s)) return s.hours;
  return Math.max(0, toMinutes(s.end) - toMinutes(s.start)) / 60;
}

/** The entries logged on `date`: hours alone first, then stretches by start. */
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

/** Hours logged in the week (seven days) starting on `start`. */
export function weekHours(log: WorkSpan[], start: ISODate): number {
  return loggedHours(log, start, addDays(start, 6));
}

/**
 * Where a week's own target is kept: under the Monday in the week starting
 * on `start`. Weeks used to start on Monday, so targets set then still
 * belong to the same week whatever day weeks start on now.
 */
export function targetKey(start: ISODate): ISODate {
  return startOfWeek(addDays(start, 6), MONDAY);
}

/** The week's target in hours: its own, if set, else the default; 0 for none. */
export function weekTarget(
  settings: Pick<Settings, 'workTarget' | 'weekWorkTargets'>,
  start: ISODate,
): number {
  return settings.weekWorkTargets[targetKey(start)] ?? settings.workTarget;
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
 * Hours of planned work in the week starting on `start` on the days nothing
 * is logged yet: once a day has a stretch logged, its log replaces its plan.
 */
export function weekPlannedHours(
  log: WorkSpan[],
  events: CalendarEvent[],
  start: ISODate,
  label: string,
): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    if (log.some(s => s.date === date)) continue;
    for (const p of plannedWork(events, date, label)) sum += spanHours(p);
  }
  return sum;
}
