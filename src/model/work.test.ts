import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import type {InitOf} from './types';
import {
  loggedHours,
  plannedWork,
  spanHours,
  spansOn,
  weekHours,
  weekTarget,
} from './work';

function span(id: string, date: string, start: string, end: string) {
  return create(pb.WorkSpanSchema, {id, date, start, end});
}

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
  const reserved = (
    id: string,
    date: string,
    start: string,
    end: string,
    title: string,
    recurrence?: InitOf<typeof pb.RecurrenceSchema>,
  ) =>
    create(pb.CalendarEventSchema, {
      id,
      kind: pb.EventKind.RESERVED,
      date,
      start,
      end,
      title,
      recurrence: recurrence && create(pb.RecurrenceSchema, recurrence),
    });
  const WORK_DAYS = [1, 2, 3, 4, 5] as pb.Weekday[];
  // From Monday 5 Oct: work on weekdays, sleep every day.
  const events = [
    reserved('w', '2026-10-05', '09:00', '17:00', 'Work', {
      unit: pb.RecurrenceUnit.WEEK,
      weekdays: WORK_DAYS,
    }),
    reserved('s', '2026-10-05', '23:00', '07:00', 'Sleep', {
      unit: pb.RecurrenceUnit.DAY,
    }),
  ];

  it('is the day’s reserved events named as work', () => {
    expect(plannedWork(events, '2026-10-12', '')).toEqual([
      {start: '09:00', end: '17:00'},
    ]);
    expect(plannedWork(events, '2026-10-11', '')).toEqual([]); // Sunday
  });

  it('follows a custom label, ignoring case, and leaves out ones past midnight', () => {
    const praca = [
      reserved('a', '2026-10-12', '14:00', '18:00', 'praca'),
      reserved('b', '2026-10-12', '08:00', '12:00', 'Praca'),
      reserved('c', '2026-10-12', '22:00', '06:00', 'Praca'),
      create(pb.CalendarEventSchema, {
        id: 'not reserved',
        date: '2026-10-12',
        start: '07:00',
        end: '08:00',
        title: 'Praca',
      }),
    ];
    expect(plannedWork(praca, '2026-10-12', 'Praca')).toEqual([
      {start: '08:00', end: '12:00'},
      {start: '14:00', end: '18:00'},
    ]);
  });
});
