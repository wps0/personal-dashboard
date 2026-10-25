import {create} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/data_pb';
import {weekdayIndex} from './dates';
import {toMinutes} from './time';
import type {Allocation, CalendarEvent, ISODate} from './types';

/** A time range; `end` before `start` wraps past midnight (e.g. sleep 23:00–07:00). */
export type TimeRange = pb.TimeRange;
/** Time of day you can plan work into, per weekday. */
export type PlanningWindow = pb.TimeRange;
/** A reserved time range, e.g. sleep or work. */
export type Reserved = pb.TimeRange;
/** One weekday's reserved time. */
export type ReservedDay = pb.ReservedDay;
/**
 * Capacity settings effective from a date. Edits create (or update) the rule
 * starting today, so past days keep the values they had.
 */
export type CapacityRule = pb.CapacityRule;
/** Per-day tweaks: a relative delta, or an absolute override that wins over everything. */
export type DayCapacity = pb.DayCapacity;

/** A time range, e.g. `range('09:00', '17:00', 'Work')`. */
export function range(start: string, end: string, label?: string): TimeRange {
  return create(pb.TimeRangeSchema, {start, end, label});
}

export interface CapacityInfo {
  window: PlanningWindow;
  windowHours: number;
  /** Hours inside the window taken by calendar events (overlaps merged). */
  busyHours: number;
  adjustment: number;
  delta: number;
  override?: number;
  /** Final capacity in hours, never negative. */
  total: number;
}

const DEFAULT_WINDOWS: PlanningWindow[] = [
  ...Array.from({length: 5}, () => range('18:00', '21:00')),
  range('10:00', '16:00'),
  range('10:00', '16:00'),
];

const SLEEP = range('23:00', '07:00', 'Sleep');
/** One weekday's reserved time, from its ranges. */
export function reservedDay(...ranges: Reserved[]): ReservedDay {
  return create(pb.ReservedDaySchema, {ranges});
}

const DEFAULT_RESERVED: ReservedDay[] = [
  ...Array.from({length: 5}, () =>
    reservedDay(SLEEP, range('09:00', '17:00', 'Work')),
  ),
  reservedDay(SLEEP),
  reservedDay(SLEEP),
];

/** A rule's reserved time per weekday, or the defaults if it has none. */
export function reservedDays(rule: CapacityRule): ReservedDay[] {
  return rule.reserved.length ? rule.reserved : DEFAULT_RESERVED;
}

/**
 * A rule's planning windows and reserved time with weekday `from`'s copied to
 * the weekdays `to` (0 is Monday).
 */
export function copyDay(
  rule: CapacityRule,
  from: number,
  to: number[],
): Pick<CapacityRule, 'windows' | 'reserved'> {
  const reserved = reservedDays(rule);
  return {
    windows: rule.windows.map((w, i) =>
      to.includes(i) ? rule.windows[from] : w,
    ),
    reserved: reserved.map((d, i) =>
      to.includes(i) ? reservedDay(...reserved[from].ranges) : d,
    ),
  };
}

export function defaultRules(): CapacityRule[] {
  return [
    create(pb.CapacityRuleSchema, {
      from: '0000-01-01',
      windows: DEFAULT_WINDOWS,
      adjustment: 0,
      reserved: DEFAULT_RESERVED,
    }),
  ];
}

/** Reserved spans for a date in minutes; ranges past midnight are drawn at both ends of the day. */
export function reservedFor(
  rules: CapacityRule[],
  date: ISODate,
): {start: number; end: number; label?: string}[] {
  const ranges =
    reservedDays(ruleFor(rules, date))[weekdayIndex(date)]?.ranges ?? [];
  return ranges.flatMap(r => {
    const s = toMinutes(r.start);
    const e = toMinutes(r.end);
    if (e > s) return [{start: s, end: e, label: r.label}];
    if (e === s) return [];
    return [
      {start: 0, end: e, label: r.label},
      {start: s, end: 24 * 60, label: r.label},
    ].filter(x => x.end > x.start);
  });
}

export function ruleFor(rules: CapacityRule[], date: ISODate): CapacityRule {
  let found = rules[0];
  for (const r of rules) if (r.from <= date) found = r;
  return found;
}

/** Minutes of `window` covered by timed events, with overlapping events merged. */
export function busyMinutes(
  window: PlanningWindow,
  events: CalendarEvent[],
): number {
  const ws = toMinutes(window.start);
  const we = toMinutes(window.end);
  const spans = events
    .filter(e => !e.allDay)
    .map(
      e =>
        [
          Math.max(ws, toMinutes(e.start)),
          Math.min(we, toMinutes(e.end)),
        ] as const,
    )
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of spans) {
    if (s > curE) {
      total += curE - curS;
      [curS, curE] = [s, e];
    } else curE = Math.max(curE, e);
  }
  return total + (curE - curS);
}

export function capacityFor(
  date: ISODate,
  rules: CapacityRule[],
  days: Record<ISODate, DayCapacity>,
  eventsOfDay: CalendarEvent[],
): CapacityInfo {
  const rule = ruleFor(rules, date);
  const window = rule.windows[weekdayIndex(date)];
  const windowHours =
    Math.max(0, toMinutes(window.end) - toMinutes(window.start)) / 60;
  const busyHours = busyMinutes(window, eventsOfDay) / 60;
  const day = days[date] ?? {};
  const delta = day.delta ?? 0;
  const computed = windowHours - busyHours + rule.adjustment + delta;
  const total = Math.max(0, Math.round((day.override ?? computed) * 4) / 4);
  return {
    window,
    windowHours,
    busyHours,
    adjustment: rule.adjustment,
    delta,
    override: day.override,
    total,
  };
}

/**
 * The planned hours that use a day's capacity: untimed sessions in full,
 * timed ones only for their part inside the planning window (a class at noon
 * doesn't take evening planning time).
 */
export function plannedInWindow(
  allocs: Allocation[],
  window: PlanningWindow,
): number {
  const from = toMinutes(window.start);
  const to = toMinutes(window.end);
  return allocs.reduce((sum, a) => {
    if (!a.start) return sum + a.plannedHours;
    const start = toMinutes(a.start);
    const end = start + a.plannedHours * 60;
    return sum + Math.max(0, Math.min(end, to) - Math.max(start, from)) / 60;
  }, 0);
}

/** Applies a settings change from `today` on: edits today's rule or appends one. */
export function withRuleChange(
  rules: CapacityRule[],
  today: ISODate,
  patch: Partial<Omit<CapacityRule, 'from'>>,
): CapacityRule[] {
  const current = ruleFor(rules, today);
  const next = {...current, ...patch, from: today};
  const kept = rules.filter(r => r.from < today);
  return [...kept, next];
}
