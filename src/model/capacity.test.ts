import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {
  capacityFor,
  defaultRules,
  freeAfter,
  plannedOnDay,
  ruleFor,
  withRuleChange,
} from './capacity';
import type {Allocation, CalendarEvent, InitOf} from './types';

function ev(
  start: string,
  end: string,
  extra: InitOf<typeof pb.CalendarEventSchema> = {},
): CalendarEvent {
  return create(pb.CalendarEventSchema, {
    id: start,
    date: '2026-10-12',
    start,
    end,
    ...extra,
  });
}

function day(d: {delta?: number; override?: number}) {
  return create(pb.DayCapacitySchema, d);
}

// Mon 12 Oct 2026; sleep 23:00–07:00 is 00:00–07:00 and 23:00–24:00 here.
const SLEEP = [
  ev('00:00', '07:00', {kind: pb.EventKind.RESERVED}),
  ev('23:00', '23:59', {kind: pb.EventKind.RESERVED}),
];
const WORK = ev('09:00', '17:00', {kind: pb.EventKind.RESERVED});

function session(hours: number, start?: string): Allocation {
  return create(pb.AllocationSchema, {
    id: `s${hours}${start ?? ''}`,
    itemId: 'i',
    date: '2026-10-12',
    plannedHours: hours,
    start,
  });
}

describe('capacity', () => {
  it('is the whole day less reserved time and events, each minute once', () => {
    const rules = defaultRules();
    // Nothing on: all 24 hours.
    expect(capacityFor('2026-10-12', rules, {}, []).total).toBe(24);
    // Sleep (8h) and work (8h); a lecture inside work hours takes nothing
    // more, one after work takes its 1h 30m.
    const info = capacityFor(
      '2026-10-12',
      rules,
      {},
      [ev('10:15', '12:00'), ev('17:30', '19:00')],
      [...SLEEP, WORK],
    );
    expect(info.reservedHours).toBe(16);
    expect(info.eventHours).toBe(1.5);
    expect(info.total).toBe(6.5);
  });

  it('merges overlapping events; all-day ones take nothing', () => {
    const info = capacityFor('2026-10-12', defaultRules(), {}, [
      ev('18:00', '19:00'),
      ev('18:30', '20:00'),
      ev('00:00', '00:00', {allDay: true}),
    ]);
    expect(info.eventHours).toBe(2);
    expect(info.total).toBe(22);
  });

  it('adds the global adjustment and the day delta; a fixed value wins', () => {
    const rules = withRuleChange(defaultRules(), '2026-10-01', {
      adjustment: -3,
    });
    const base = (d = {}) =>
      capacityFor(
        '2026-10-12',
        rules,
        {'2026-10-12': day(d)},
        [],
        [...SLEEP, WORK],
      ).total;
    expect(base()).toBe(5);
    expect(base({delta: 1.5})).toBe(6.5);
    expect(base({delta: -9})).toBe(0);
    expect(base({override: 2})).toBe(2);
  });

  it('keeps the old planning windows in the data, unused, for older versions', () => {
    expect(defaultRules()[0].windows).toHaveLength(7);
    const rules = withRuleChange(defaultRules(), '2026-10-01', {adjustment: 1});
    expect(ruleFor(rules, '2026-10-12').windows).toHaveLength(7);
  });

  it('applies rule changes from today on, leaving past days alone', () => {
    let rules = defaultRules();
    rules = withRuleChange(rules, '2026-10-10', {adjustment: 1});
    expect(ruleFor(rules, '2026-10-09').adjustment).toBe(0);
    expect(ruleFor(rules, '2026-10-10').adjustment).toBe(1);
    // A second change on the same day edits that day's rule instead of stacking.
    rules = withRuleChange(rules, '2026-10-10', {adjustment: 2});
    expect(rules).toHaveLength(2);
    // A later change keeps earlier history.
    rules = withRuleChange(rules, '2026-10-20', {adjustment: -1});
    expect([
      ruleFor(rules, '2026-10-01').adjustment,
      ruleFor(rules, '2026-10-15').adjustment,
      ruleFor(rules, '2026-10-25').adjustment,
    ]).toEqual([0, 2, -1]);
  });
});

describe('plannedOnDay', () => {
  const info = capacityFor(
    '2026-10-12',
    defaultRules(),
    {},
    [ev('18:00', '19:00')],
    [...SLEEP, WORK],
  );

  it('counts untimed sessions in full, and time blocks wherever the day is free', () => {
    expect(plannedOnDay([session(2)], info)).toBe(2);
    // At noon it's on work time, already out of the capacity; at 19:00 it
    // counts in full.
    expect(plannedOnDay([session(2, '12:00')], info)).toBe(0);
    expect(plannedOnDay([session(2, '19:00')], info)).toBe(2);
  });

  it('leaves out the part on reserved time or an event, already out of the capacity', () => {
    // 16:00–18:30: 16–17 is work, 18–18:30 the event; 17:00–18:00 counts.
    expect(plannedOnDay([session(2.5, '16:00')], info)).toBe(1);
  });
});

describe('freeAfter', () => {
  it('is what reserved time and events leave of the rest of the day', () => {
    const info = capacityFor(
      '2026-10-12',
      defaultRules(),
      {},
      [ev('18:00', '19:00')],
      [...SLEEP, WORK],
    );
    // From 13:00: 4h of work, 1h of events and 1h of sleep go; 5h left.
    expect(freeAfter(info, 13 * 60)).toBe(5 * 60);
    expect(freeAfter(info, 23 * 60 + 30)).toBe(0);
  });
});
