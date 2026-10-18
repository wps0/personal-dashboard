import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/v2/data_pb';
import {
  busyMinutes,
  capacityFor,
  defaultRules,
  range,
  reservedFor,
  ruleFor,
  withRuleChange,
} from './capacity';
import type {CalendarEvent, InitOf} from './types';

const ev = (
  start: string,
  end: string,
  extra: InitOf<typeof pb.CalendarEventSchema> = {},
): CalendarEvent =>
  create(pb.CalendarEventSchema, {
    id: start,
    date: '2026-10-12',
    start,
    end,
    ...extra,
  });

const day = (d: {delta?: number; override?: number}) =>
  create(pb.DayCapacitySchema, d);

describe('capacity', () => {
  it('subtracts merged event time inside the planning window only', () => {
    const w = range('18:00', '22:00');
    expect(busyMinutes(w, [])).toBe(0);
    expect(busyMinutes(w, [ev('09:00', '10:00')])).toBe(0); // outside
    expect(busyMinutes(w, [ev('17:00', '19:00')])).toBe(60); // clipped
    expect(
      busyMinutes(w, [
        ev('19:00', '20:00'),
        ev('19:30', '20:30'),
        ev('21:00', '21:15'),
      ]),
    ).toBe(105); // merged
    expect(busyMinutes(w, [ev('19:00', '20:00', {allDay: true})])).toBe(0);
  });

  it('combines window, events, global adjustment, day delta and override', () => {
    const rules = [
      create(pb.CapacityRuleSchema, {
        from: '0000-01-01',
        windows: Array.from({length: 7}, () => range('18:00', '22:00')),
        adjustment: -0.5,
      }),
    ];
    const monday = '2026-10-12';
    expect(capacityFor(monday, rules, {}, [ev('19:00', '20:00')]).total).toBe(
      2.5,
    ); // 4 - 1 - 0.5
    expect(
      capacityFor(monday, rules, {[monday]: day({delta: 1})}, []).total,
    ).toBe(4.5);
    expect(
      capacityFor(monday, rules, {[monday]: day({delta: 1, override: 2})}, [])
        .total,
    ).toBe(2);
    expect(
      capacityFor(monday, rules, {[monday]: day({delta: -9})}, []).total,
    ).toBe(0);
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

describe('reservedFor', () => {
  it('splits ranges that wrap past midnight and uses the weekday', () => {
    const rules = defaultRules();
    expect(reservedFor(rules, '2026-10-12')).toEqual([
      {start: 0, end: 420, label: 'Sleep'},
      {start: 1380, end: 1440, label: 'Sleep'},
      {start: 540, end: 1020, label: 'Work'},
    ]);
    expect(reservedFor(rules, '2026-10-11').map(r => r.label)).toEqual([
      'Sleep',
      'Sleep',
    ]); // Sunday: no work
  });
});
