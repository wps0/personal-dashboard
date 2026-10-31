import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {
  busyMinutes,
  capacityFor,
  copyDay,
  plannedInWindow,
  defaultRules,
  range,
  ruleFor,
  withRuleChange,
} from './capacity';
import type {CalendarEvent, InitOf} from './types';

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

describe('copyDay', () => {
  it('copies a weekday’s planning window to the picked days only', () => {
    const rule = {
      ...defaultRules()[0],
      windows: defaultRules()[0].windows.map((w, i) =>
        i === 2 ? range('08:00', '12:00') : w,
      ),
    };
    const out = copyDay(rule, 2, [0, 6]);
    expect(out.windows.map(w => `${w.start}-${w.end}`)).toEqual([
      '08:00-12:00',
      '18:00-21:00',
      '08:00-12:00',
      '18:00-21:00',
      '18:00-21:00',
      '10:00-16:00',
      '08:00-12:00',
    ]);
  });
});

describe('plannedInWindow', () => {
  const session = (plannedHours: number, start?: string) =>
    create(pb.AllocationSchema, {plannedHours, start});
  const evening = range('18:00', '21:00');

  it('counts untimed sessions in full and timed ones only inside the window', () => {
    expect(
      plannedInWindow(
        [
          session(2), // untimed: meant for the window
          session(1.5, '12:15'), // a class at noon: outside
          session(1, '20:30'), // half inside
          session(1, '18:30'), // inside
        ],
        evening,
      ),
    ).toBe(3.5);
  });
});
