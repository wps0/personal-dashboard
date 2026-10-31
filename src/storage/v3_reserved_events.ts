/**
 * @fileoverview The step to schema version 3: reserved time moves from the
 * capacity settings (per weekday, and a day's own once edited on the
 * calendar) to reserved events, which can repeat.
 *
 * Self-contained on purpose: version 2's defaults and its weekday rules are
 * copied here, so later changes to the app can't change what this step
 * makes. Deterministic (see migrations.ts): ids come from the content.
 */

import {create} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/data_pb';

interface Range {
  start: string;
  end: string;
  label?: string;
}

const SLEEP: Range = {start: '23:00', end: '07:00', label: 'Sleep'};
const WORK: Range = {start: '09:00', end: '17:00', label: 'Work'};
/** Version 2's reserved time for a rule without its own, Monday first. */
const V2_DEFAULTS: Range[][] = [
  [SLEEP, WORK],
  [SLEEP, WORK],
  [SLEEP, WORK],
  [SLEEP, WORK],
  [SLEEP, WORK],
  [SLEEP],
  [SLEEP],
];
/** Where the reserved time of a rule from the beginning of time starts. */
const EARLIEST = '2000-01-03';

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function pad(n: number) {
  return String(n).padStart(2, '0');
}
function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Monday = 1 … Sunday = 7, as `pb.Weekday`. */
function weekday(s: string): pb.Weekday {
  return (((parse(s).getDay() + 6) % 7) + 1) as pb.Weekday;
}

/** A readable id part: letters and digits only. */
function slug(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '_');
}

interface Weekly {
  event: pb.CalendarEvent;
  weekdays: pb.Weekday[];
  until?: string;
}

function happens(w: Weekly, date: string): boolean {
  return (
    date >= w.event.date &&
    (w.until === undefined || date <= w.until) &&
    w.weekdays.includes(weekday(date))
  );
}

function reserved(
  id: string,
  date: string,
  r: Range,
  more: {recurrence?: pb.Recurrence} = {},
): pb.CalendarEvent {
  return create(pb.CalendarEventSchema, {
    id,
    kind: pb.EventKind.RESERVED,
    title: r.label ?? '',
    date,
    start: r.start,
    end: r.end,
    ...more,
  });
}

/** Version 2 data with its reserved time as reserved events. */
export function reservedToEvents(data: pb.AppData): pb.AppData {
  const settings = data.settings;
  // No settings, or no rules: version 2 used its defaults.
  const rules = settings?.capacityRules.length
    ? settings.capacityRules
    : [create(pb.CapacityRuleSchema, {from: '0000-01-01'})];

  const weekly: Weekly[] = [];
  rules.forEach((rule, i) => {
    const from = rule.from < EARLIEST ? EARLIEST : rule.from;
    const next = rules[i + 1]?.from;
    const until = next === undefined ? undefined : addDays(next, -1);
    if (until !== undefined && until < from) return;
    const days = rule.reserved.length
      ? rule.reserved.map(d => d.ranges as Range[])
      : V2_DEFAULTS;
    // The same range on several weekdays becomes one repeating event.
    const groups = new Map<string, {r: Range; weekdays: pb.Weekday[]}>();
    days.forEach((ranges, w) => {
      for (const r of ranges) {
        if (r.start === r.end) continue;
        const key = `${r.start}-${r.end}-${r.label ?? ''}`;
        const g = groups.get(key) ?? {r, weekdays: []};
        g.weekdays.push((w + 1) as pb.Weekday);
        groups.set(key, g);
      }
    });
    for (const {r, weekdays} of groups.values()) {
      let first = from;
      while (!weekdays.includes(weekday(first))) first = addDays(first, 1);
      if (until !== undefined && first > until) continue;
      const id = `reserved-${from}-${r.start}-${r.end}-${slug(r.label ?? '')}`;
      const recurrence = create(pb.RecurrenceSchema, {
        unit:
          weekdays.length === 7
            ? pb.RecurrenceUnit.DAY
            : pb.RecurrenceUnit.WEEK,
        interval: 1,
        weekdays: weekdays.length === 7 ? [] : weekdays,
        until,
      });
      weekly.push({
        event: reserved(id, first, r, {recurrence}),
        weekdays,
        until,
      });
    }
  });

  // A day with reserved time of its own: the weekly events skip it, and its
  // ranges become events on that day.
  const own: pb.CalendarEvent[] = [];
  const days = Object.entries(settings?.dayCapacity ?? {})
    .filter(([, d]) => d.reserved)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [date, day] of days) {
    for (const w of weekly)
      if (happens(w, date)) w.event.skippedDates.push(date);
    day.reserved!.ranges.forEach((r, i) => {
      if (r.start !== r.end)
        own.push(reserved(`reserved-${date}-${i}`, date, r as Range));
    });
  }

  if (!settings)
    return {
      ...data,
      events: [...data.events, ...weekly.map(w => w.event), ...own],
    };
  const dayCapacity: Record<string, pb.DayCapacity> = {};
  for (const [date, day] of Object.entries(settings.dayCapacity)) {
    if (day.delta === undefined && day.override === undefined) continue;
    dayCapacity[date] = {...day, reserved: undefined};
  }
  return {
    ...data,
    events: [...data.events, ...weekly.map(w => w.event), ...own],
    settings: {
      ...settings,
      capacityRules: settings.capacityRules.map(r => ({...r, reserved: []})),
      dayCapacity,
    },
  };
}
