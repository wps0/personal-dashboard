import {weekdayIndex} from './dates';
import {toMinutes} from './time';
import type {CalendarEvent, ISODate} from './types';

/** Time of day you can plan work into, per weekday. */
export interface PlanningWindow {
  start: string;
  end: string;
}

/**
 * Capacity settings effective from a date. Edits create (or update) the rule
 * starting today, so past days keep the values they had.
 */
export interface CapacityRule {
  from: ISODate;
  /** Indexed Mon=0 … Sun=6. */
  windows: PlanningWindow[];
  /** Hours added to (or, if negative, removed from) every day. */
  adjustment: number;
  /** Reserved time per weekday (sleep, work), shown hatched on the calendar. Informational only. */
  reserved?: Reserved[][];
}

/** A reserved time range; `end` before `start` wraps past midnight (e.g. sleep 23:00–07:00). */
export interface Reserved {
  start: string;
  end: string;
  label?: string;
}

/** Per-day tweaks: a relative delta, or an absolute override that wins over everything. */
export interface DayCapacity {
  delta?: number;
  override?: number;
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

export const DEFAULT_WINDOWS: PlanningWindow[] = [
  ...Array.from({length: 5}, () => ({start: '18:00', end: '21:00'})),
  {start: '10:00', end: '16:00'},
  {start: '10:00', end: '16:00'},
];

const SLEEP: Reserved = {start: '23:00', end: '07:00', label: 'Sleep'};
export const DEFAULT_RESERVED: Reserved[][] = [
  ...Array.from({length: 5}, () => [
    SLEEP,
    {start: '09:00', end: '17:00', label: 'Work'},
  ]),
  [SLEEP],
  [SLEEP],
];

export function defaultRules(): CapacityRule[] {
  return [
    {
      from: '0000-01-01',
      windows: DEFAULT_WINDOWS,
      adjustment: 0,
      reserved: DEFAULT_RESERVED,
    },
  ];
}

/** Reserved spans for a date in minutes; ranges past midnight are drawn at both ends of the day. */
export function reservedFor(
  rules: CapacityRule[],
  date: ISODate,
): {start: number; end: number; label?: string}[] {
  const ranges =
    (ruleFor(rules, date).reserved ?? DEFAULT_RESERVED)[weekdayIndex(date)] ??
    [];
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

/** Converts the old fixed hours-per-weekday setting into windows of the same length. */
export function rulesFromLegacyHours(hours: number[]): CapacityRule[] {
  const windows = hours.map((h, i) => {
    const start = i < 5 ? 18 * 60 : 10 * 60;
    const end = Math.min(start + Math.round(h * 60), 24 * 60 - 1);
    const t = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return {start: t(start), end: t(end)};
  });
  return [
    {from: '0000-01-01', windows, adjustment: 0, reserved: DEFAULT_RESERVED},
  ];
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
