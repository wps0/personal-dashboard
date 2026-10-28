import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {defaultRules, range, reservedDay} from './capacity';
import {
  loggedHours,
  plannedWork,
  spanHours,
  spansOn,
  weekHours,
  weekTarget,
} from './work';

const span = (id: string, date: string, start: string, end: string) =>
  create(pb.WorkSpanSchema, {id, date, start, end});

describe('the work log', () => {
  const log = [
    span('b', '2026-10-12', '13:00', '17:30'),
    span('a', '2026-10-12', '08:45', '12:00'),
    span('c', '2026-10-18', '10:00', '11:00'),
    span('d', '2026-10-19', '09:00', '17:00'),
  ];

  it('adds up hours per day, range and week', () => {
    expect(spanHours(log[0])).toBe(4.5);
    expect(spansOn(log, '2026-10-12').map(s => s.id)).toEqual(['a', 'b']);
    expect(loggedHours(log, '2026-10-12', '2026-10-12')).toBe(7.75);
    // Monday 12 Oct to Sunday 18 Oct.
    expect(weekHours(log, '2026-10-12')).toBe(8.75);
    expect(weekHours(log, '2026-10-19')).toBe(8);
  });

  it('uses a week’s own target over the default', () => {
    const settings = {workTarget: 40, weekWorkTargets: {'2026-10-19': 0}};
    expect(weekTarget(settings, '2026-10-12')).toBe(40);
    expect(weekTarget(settings, '2026-10-19')).toBe(0);
  });
});

describe('plannedWork', () => {
  const rules = defaultRules(); // weekdays: Sleep 23:00–07:00, Work 09:00–17:00

  it('is the day’s reserved time labelled as work', () => {
    expect(plannedWork(rules, {}, '2026-10-12', '')).toEqual([
      {start: '09:00', end: '17:00'},
    ]);
    expect(plannedWork(rules, {}, '2026-10-11', '')).toEqual([]); // Sunday
  });

  it('follows the day’s own reserved time and a custom label, ignoring case', () => {
    const days = {
      '2026-10-12': create(pb.DayCapacitySchema, {
        reserved: reservedDay(
          range('14:00', '18:00', 'praca'),
          range('08:00', '12:00', 'Praca'),
          range('22:00', '06:00', 'Praca'), // past midnight: left out
        ),
      }),
    };
    expect(plannedWork(rules, days, '2026-10-12', 'Praca')).toEqual([
      {start: '08:00', end: '12:00'},
      {start: '14:00', end: '18:00'},
    ]);
  });
});
