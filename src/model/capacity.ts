import {create} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/data_pb';
import {endMinutes, toMinutes} from './time';
import type {Allocation, CalendarEvent, ISODate} from './types';

/** A time range. */
export type TimeRange = pb.TimeRange;
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

/** Minutes in a day: what capacity starts from. */
export const DAY_MINUTES = 24 * 60;

export interface CapacityInfo {
  /** Hours of reserved time on the day (sleep, work), each minute once. */
  reservedHours: number;
  /**
   * Hours of timed events on the day outside reserved time, each minute
   * once: an event on reserved time takes that time once.
   */
  eventHours: number;
  /** Reserved time and events together, merged and in order. */
  occupied: readonly Span[];
  adjustment: number;
  delta: number;
  override?: number;
  /** Final capacity in hours, never negative. */
  total: number;
}

/**
 * Before capacity counted the whole day, it counted a planning window per
 * weekday (e.g. 18:00–21:00). The windows are no longer used, but rules keep
 * them so that older versions of the app, which read them, can still read
 * the data.
 */
const LEGACY_WINDOWS: TimeRange[] = [
  ...Array.from({length: 5}, () => range('18:00', '21:00')),
  range('10:00', '16:00'),
  range('10:00', '16:00'),
];

export function defaultRules(): CapacityRule[] {
  return [
    create(pb.CapacityRuleSchema, {
      from: '0000-01-01',
      windows: LEGACY_WINDOWS,
      adjustment: 0,
    }),
  ];
}

export function ruleFor(rules: CapacityRule[], date: ISODate): CapacityRule {
  let found = rules[0];
  for (const r of rules) if (r.from <= date) found = r;
  return found;
}

/** The parts of the day covered by timed events, overlapping ones merged, in order. */
export function occupiedSpans(events: CalendarEvent[]): Span[] {
  const spans = events
    .filter(e => !e.allDay)
    .map((e): Span => [
      Math.max(0, toMinutes(e.start)),
      Math.min(DAY_MINUTES, endMinutes(e.end)),
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

const minutesOf = (spans: readonly Span[]) =>
  spans.reduce((sum, [s, e]) => sum + e - s, 0);

/**
 * A day's capacity: the whole day (24h) less its reserved time and timed
 * events (each minute once), plus the global adjustment and the day's own
 * delta; or the day's fixed value. All-day events take nothing.
 * `reservedOfDay` holds the day's pieces of reserved time, none past
 * midnight (sleep from 23:00 is 23:00–24:00 here and 00:00–07:00 the next
 * day).
 */
export function capacityFor(
  date: ISODate,
  rules: CapacityRule[],
  days: Record<ISODate, DayCapacity>,
  eventsOfDay: CalendarEvent[],
  reservedOfDay: CalendarEvent[] = [],
): CapacityInfo {
  const rule = ruleFor(rules, date);
  const reserved = minutesOf(occupiedSpans(reservedOfDay)) / 60;
  const occupied = occupiedSpans([...eventsOfDay, ...reservedOfDay]);
  const occupiedHours = minutesOf(occupied) / 60;
  const day = days[date] ?? {};
  const delta = day.delta ?? 0;
  const computed = DAY_MINUTES / 60 - occupiedHours + rule.adjustment + delta;
  const total = Math.max(0, Math.round((day.override ?? computed) * 4) / 4);
  return {
    reservedHours: reserved,
    eventHours: occupiedHours - reserved,
    occupied,
    adjustment: rule.adjustment,
    delta,
    override: day.override,
    total,
  };
}

const overlap = (a: number, b: number, s: number, e: number) =>
  Math.max(0, Math.min(b, e) - Math.max(a, s));

/**
 * The planned hours that use a day's capacity: untimed sessions in full,
 * timed ones (time blocks) except their part on reserved time or an event,
 * which is already out of the capacity, so it isn't taken twice.
 */
export function plannedOnDay(
  allocs: Allocation[],
  {occupied}: Pick<CapacityInfo, 'occupied'>,
): number {
  return allocs.reduce((sum, a) => {
    if (!a.start) return sum + a.plannedHours;
    const start = toMinutes(a.start);
    const end = start + a.plannedHours * 60;
    const onOccupied = occupied.reduce(
      (taken, [s, e]) => taken + overlap(start, end, s, e),
      0,
    );
    return sum + (end - start - onOccupied) / 60;
  }, 0);
}

/** Minutes of the day after `now` that reserved time and events leave free. */
export function freeAfter(
  {occupied}: Pick<CapacityInfo, 'occupied'>,
  now: number,
): number {
  const left = Math.max(0, DAY_MINUTES - now);
  return (
    left -
    occupied.reduce((sum, [s, e]) => sum + overlap(now, DAY_MINUTES, s, e), 0)
  );
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
