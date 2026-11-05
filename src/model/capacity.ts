import {create} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/data_pb';
import {weekdayIndex} from './dates';
import {toMinutes} from './time';
import type {Allocation, CalendarEvent, ISODate} from './types';

/** A time range, e.g. a planning window. */
export type TimeRange = pb.TimeRange;
/** Time of day you can plan work into, per weekday. */
export type PlanningWindow = pb.TimeRange;
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

/** A part of a day, from `[0]` to `[1]` minutes after midnight. */
export type Span = readonly [number, number];

export interface CapacityInfo {
  window: PlanningWindow;
  windowHours: number;
  /**
   * Hours of the window occupied by reserved time and calendar events: each
   * minute once, however many of them overlap there.
   */
  occupiedHours: number;
  /** Those parts of the window, merged and in order. */
  occupied: readonly Span[];
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

/** A rule's planning windows with weekday `from`'s copied to the weekdays `to` (0 is Monday). */
export function copyDay(
  rule: CapacityRule,
  from: number,
  to: number[],
): Pick<CapacityRule, 'windows'> {
  return {
    windows: rule.windows.map((w, i) =>
      to.includes(i) ? rule.windows[from] : w,
    ),
  };
}

export function defaultRules(): CapacityRule[] {
  return [
    create(pb.CapacityRuleSchema, {
      from: '0000-01-01',
      windows: DEFAULT_WINDOWS,
      adjustment: 0,
    }),
  ];
}

export function ruleFor(rules: CapacityRule[], date: ISODate): CapacityRule {
  let found = rules[0];
  for (const r of rules) if (r.from <= date) found = r;
  return found;
}

/** The parts of `window` covered by timed events, overlapping ones merged, in order. */
export function occupiedSpans(
  window: PlanningWindow,
  events: CalendarEvent[],
): Span[] {
  const ws = toMinutes(window.start);
  const we = toMinutes(window.end);
  const spans = events
    .filter(e => !e.allDay)
    .map((e): Span => [
      Math.max(ws, toMinutes(e.start)),
      Math.min(we, toMinutes(e.end)),
    ])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/** Minutes of `window` covered by timed events, with overlapping events merged. */
export function busyMinutes(
  window: PlanningWindow,
  events: CalendarEvent[],
): number {
  return occupiedSpans(window, events).reduce((sum, [s, e]) => sum + e - s, 0);
}

/**
 * A day's capacity: its planning window minus the time occupied by events and
 * reserved time inside it (each minute once), plus the adjustments.
 * `reservedOfDay` holds the day's pieces of reserved time, none past
 * midnight.
 */
export function capacityFor(
  date: ISODate,
  rules: CapacityRule[],
  days: Record<ISODate, DayCapacity>,
  eventsOfDay: CalendarEvent[],
  reservedOfDay: CalendarEvent[] = [],
): CapacityInfo {
  const rule = ruleFor(rules, date);
  const window = rule.windows[weekdayIndex(date)];
  const windowHours =
    Math.max(0, toMinutes(window.end) - toMinutes(window.start)) / 60;
  // An event on reserved time takes that time once.
  const occupied = occupiedSpans(window, [...eventsOfDay, ...reservedOfDay]);
  const occupiedHours = occupied.reduce((sum, [s, e]) => sum + e - s, 0) / 60;
  const day = days[date] ?? {};
  const delta = day.delta ?? 0;
  const computed = windowHours - occupiedHours + rule.adjustment + delta;
  const total = Math.max(0, Math.round((day.override ?? computed) * 4) / 4);
  return {
    window,
    windowHours,
    occupiedHours,
    occupied,
    adjustment: rule.adjustment,
    delta,
    override: day.override,
    total,
  };
}

/**
 * The planned hours that use a day's capacity: untimed sessions in full,
 * timed ones only for their part inside the planning window (a class at noon
 * doesn't take evening planning time) and outside its occupied time (a time
 * block on reserved time or an event: that time is already out of the
 * capacity, so it isn't taken twice).
 */
export function plannedInWindow(
  allocs: Allocation[],
  {window, occupied}: Pick<CapacityInfo, 'window' | 'occupied'>,
): number {
  const from = toMinutes(window.start);
  const to = toMinutes(window.end);
  const overlap = (a: number, b: number, s: number, e: number) =>
    Math.max(0, Math.min(b, e) - Math.max(a, s));
  return allocs.reduce((sum, a) => {
    if (!a.start) return sum + a.plannedHours;
    const start = toMinutes(a.start);
    const end = start + a.plannedHours * 60;
    const inWindow = overlap(start, end, from, to);
    const onOccupied = occupied.reduce(
      (taken, [s, e]) => taken + overlap(start, end, s, e),
      0,
    );
    return sum + (inWindow - onOccupied) / 60;
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
