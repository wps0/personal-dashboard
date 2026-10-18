import {describe, expect, it} from 'vitest';
import {
  busyMinutes,
  capacityFor,
  defaultRules,
  reservedFor,
  ruleFor,
  rulesFromLegacyHours,
  withRuleChange,
} from './capacity';
import type {CalendarEvent} from './types';

const ev = (
  start: string,
  end: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id: start,
  title: '',
  date: '2026-10-12',
  start,
  end,
  ...extra,
});

describe('capacity', () => {
  it('subtracts merged event time inside the planning window only', () => {
    const w = {start: '18:00', end: '22:00'};
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
      {
        from: '0000-01-01',
        windows: Array(7).fill({start: '18:00', end: '22:00'}),
        adjustment: -0.5,
        reserved: [],
      },
    ];
    const monday = '2026-10-12';
    expect(capacityFor(monday, rules, {}, [ev('19:00', '20:00')]).total).toBe(
      2.5,
    ); // 4 - 1 - 0.5
    expect(capacityFor(monday, rules, {[monday]: {delta: 1}}, []).total).toBe(
      4.5,
    );
    expect(
      capacityFor(monday, rules, {[monday]: {delta: 1, override: 2}}, []).total,
    ).toBe(2);
    expect(capacityFor(monday, rules, {[monday]: {delta: -9}}, []).total).toBe(
      0,
    );
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

  it('converts legacy fixed hours into windows of the same length', () => {
    const [r] = rulesFromLegacyHours([2, 2, 2, 2, 2, 5, 5]);
    expect(r.windows[0]).toEqual({start: '18:00', end: '20:00'});
    expect(r.windows[6]).toEqual({start: '10:00', end: '15:00'});
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
