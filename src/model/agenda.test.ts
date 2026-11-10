import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {dayAgenda, nowPosition} from './agenda';
import type {InitOf} from './types';

const DAY = '2026-11-10';

function event(
  id: string,
  start: string,
  end: string,
  extra: InitOf<typeof pb.CalendarEventSchema> = {},
) {
  return create(pb.CalendarEventSchema, {
    id,
    title: id,
    date: DAY,
    start,
    end,
    ...extra,
  });
}

function session(id: string, hours: number, start?: string, date = DAY) {
  return create(pb.AllocationSchema, {
    id,
    itemId: 'i',
    date,
    plannedHours: hours,
    start,
  });
}

const RESERVED = {kind: pb.EventKind.RESERVED};

describe('dayAgenda', () => {
  const agenda = dayAgenda(DAY, {
    events: [
      event('climbing', '19:00', '20:30'),
      event('birthday', '09:00', '10:00', {allDay: true}),
      event('work', '09:00', '17:00', RESERVED),
      event('sleep', '23:00', '07:00', RESERVED),
      event('lecture', '10:15', '12:00'),
      event('other day', '08:00', '09:00', {date: '2026-11-11'}),
    ],
    allocations: [
      session('block', 1.5, '17:00'),
      session('any time', 0.5),
      session('tomorrow', 1, undefined, '2026-11-11'),
    ],
  });

  it('lists what has a time in time order: events, reserved time, time blocks', () => {
    expect(agenda.timed.map(e => `${e.kind} ${e.start}–${e.end}`)).toEqual([
      'reserved 540–1020',
      'event 615–720',
      'session 1020–1110',
      'event 1140–1230',
    ]);
  });

  it('leaves out reserved time past midnight (sleep)', () => {
    expect(
      agenda.timed.some(e => e.kind === 'reserved' && e.span.key === 'sleep'),
    ).toBe(false);
  });

  it('keeps all-day events and sessions without a time apart', () => {
    expect(agenda.allDay.map(e => e.id)).toEqual(['birthday']);
    expect(agenda.untimed.map(a => a.id)).toEqual(['any time']);
  });

  it('puts the longer of two that start together first', () => {
    const a = dayAgenda(DAY, {
      events: [
        event('short', '09:00', '09:30'),
        event('long', '09:00', '11:00'),
      ],
      allocations: [],
    });
    expect(a.timed.map(e => e.kind === 'event' && e.event.id)).toEqual([
      'long',
      'short',
    ]);
  });
});

describe('nowPosition', () => {
  const {timed} = dayAgenda(DAY, {
    events: [event('a', '09:00', '10:00'), event('b', '14:00', '15:00')],
    allocations: [],
  });

  it('is before the first entry still to start', () => {
    expect(nowPosition(timed, 8 * 60)).toBe(0);
    // During one: after it, before the next.
    expect(nowPosition(timed, 9 * 60 + 30)).toBe(1);
    expect(nowPosition(timed, 13 * 60)).toBe(1);
  });

  it('is at the end once everything has started', () => {
    expect(nowPosition(timed, 14 * 60)).toBe(2);
    expect(nowPosition([], 600)).toBe(0);
  });
});
