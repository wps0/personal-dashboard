import {create, equals, toBinary} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import type {InitOf} from '../model/types';
import {decode} from './codec';
import {reservedToEvents} from './v3_reserved_events';

const {MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY} = pb.Weekday;
const WORK_DAYS = [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY];

function range(start: string, end: string, label?: string) {
  return create(pb.TimeRangeSchema, {start, end, label});
}
function day(...ranges: pb.TimeRange[]) {
  return create(pb.ReservedDaySchema, {ranges});
}
/** A week's reserved time: Monday to Friday `weekday`, the weekend `weekend`. */
function week(weekday: pb.TimeRange[], weekend: pb.TimeRange[] = []) {
  return [
    ...Array.from({length: 5}, () => day(...weekday)),
    day(...weekend),
    day(...weekend),
  ];
}
function data(settings?: InitOf<typeof pb.SettingsSchema>) {
  return create(pb.AppDataSchema, {
    settings: settings && create(pb.SettingsSchema, settings),
  });
}
const summary = (e: pb.CalendarEvent) => ({
  title: e.title,
  date: e.date,
  time: `${e.start}–${e.end}`,
  unit: e.recurrence?.unit,
  weekdays: e.recurrence?.weekdays,
  until: e.recurrence?.until,
  skipped: e.skippedDates,
});

describe('reserved time to reserved events (version 2 → 3)', () => {
  it('a rule without reserved time had the defaults: daily sleep, work on weekdays', () => {
    const out = reservedToEvents(data({capacityRules: [{from: '0000-01-01'}]}));
    expect(out.events.map(summary)).toEqual([
      {
        title: 'Sleep',
        date: '2000-01-03',
        time: '23:00–07:00',
        unit: pb.RecurrenceUnit.DAY,
        weekdays: [],
        until: undefined,
        skipped: [],
      },
      {
        title: 'Work',
        date: '2000-01-03',
        time: '09:00–17:00',
        unit: pb.RecurrenceUnit.WEEK,
        weekdays: WORK_DAYS,
        until: undefined,
        skipped: [],
      },
    ]);
    expect(out.events.every(e => e.kind === pb.EventKind.RESERVED)).toBe(true);
    expect(out.settings!.capacityRules[0].reserved).toEqual([]);
  });

  it('no settings at all: the defaults too, and the settings stay unset', () => {
    const out = reservedToEvents(data());
    expect(out.events.map(e => e.title)).toEqual(['Sleep', 'Work']);
    expect(out.settings).toBeUndefined();
  });

  it('a rule history becomes events with start and end dates', () => {
    const out = reservedToEvents(
      data({
        capacityRules: [
          {
            from: '0000-01-01',
            reserved: week([range('09:00', '17:00', 'Work')]),
          },
          // From Tuesday 1 Sep 2026: work 10–18, and a gym on Saturdays.
          {
            from: '2026-09-01',
            reserved: week(
              [range('10:00', '18:00', 'Work')],
              [range('10:00', '11:00', 'Gym')],
            ),
          },
        ],
      }),
    );
    expect(out.events.map(summary)).toEqual([
      expect.objectContaining({
        title: 'Work',
        date: '2000-01-03',
        time: '09:00–17:00',
        until: '2026-08-31',
      }),
      expect.objectContaining({
        title: 'Work',
        date: '2026-09-01',
        time: '10:00–18:00',
        weekdays: WORK_DAYS,
        until: undefined,
      }),
      expect.objectContaining({
        title: 'Gym',
        date: '2026-09-05',
        weekdays: [pb.Weekday.SATURDAY, pb.Weekday.SUNDAY],
      }),
    ]);
  });

  it('a day with its own reserved time: the weekly ones skip it, its own become events', () => {
    const out = reservedToEvents(
      data({
        capacityRules: [
          {
            from: '0000-01-01',
            reserved: week([range('09:00', '17:00', 'Work')]),
          },
        ],
        dayCapacity: {
          // A Wednesday: work moved to the afternoon, and capacity +1h.
          '2026-10-14': {
            delta: 1,
            reserved: day(range('12:00', '20:00', 'Work')),
          },
          // A Saturday with nothing weekly: nothing to skip.
          '2026-10-17': {reserved: day(range('10:00', '12:00', 'Work'))},
          // A Thursday with all reserved time removed.
          '2026-10-15': {reserved: day()},
        },
      }),
    );
    const [weekly, ...own] = out.events;
    expect(weekly.skippedDates).toEqual(['2026-10-14', '2026-10-15']);
    expect(own.map(summary)).toEqual([
      expect.objectContaining({
        date: '2026-10-14',
        time: '12:00–20:00',
        unit: undefined,
      }),
      expect.objectContaining({date: '2026-10-17', time: '10:00–12:00'}),
    ]);
    // Only the capacity tweak is left of the days.
    expect(Object.keys(out.settings!.dayCapacity)).toEqual(['2026-10-14']);
    expect(out.settings!.dayCapacity['2026-10-14']).toMatchObject({delta: 1});
    expect(out.settings!.dayCapacity['2026-10-14'].reserved).toBeUndefined();
  });

  it('is deterministic: the same ids and dates however the days are ordered', () => {
    const days = {
      '2026-10-14': {reserved: day(range('12:00', '13:00', 'Lunch & co.'))},
      '2026-10-13': {reserved: day()},
    };
    const a = reservedToEvents(
      data({capacityRules: [{from: '0000-01-01'}], dayCapacity: days}),
    );
    const b = reservedToEvents(
      data({
        capacityRules: [{from: '0000-01-01'}],
        dayCapacity: {
          '2026-10-13': days['2026-10-13'],
          '2026-10-14': days['2026-10-14'],
        },
      }),
    );
    expect(equals(pb.AppDataSchema, a, b)).toBe(true);
    expect(a.events.map(e => e.id)).toEqual([
      'reserved-2000-01-03-23:00-07:00-Sleep',
      'reserved-2000-01-03-09:00-17:00-Work',
      'reserved-2026-10-14-0',
    ]);
    expect(a.events[0].skippedDates).toEqual(['2026-10-13', '2026-10-14']);
  });

  it('runs when version 2 data is read', () => {
    const v2 = toBinary(pb.AppDataSchema, {
      ...data({capacityRules: [{from: '0000-01-01'}]}),
      schemaVersion: 2,
    });
    const out = decode(v2);
    expect(out.events.map(e => e.title)).toEqual(['Sleep', 'Work']);
    // Version 3 data isn't migrated again.
    expect(
      decode(toBinary(pb.AppDataSchema, {...out, schemaVersion: 3})).events,
    ).toHaveLength(2);
  });
});
