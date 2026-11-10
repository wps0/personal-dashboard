import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {
  edgeLimits,
  movedReserved,
  reservedByDay,
  resizedReserved,
  type ReservedSpan,
} from './reserved';
import type {InitOf} from './types';

function reserved(
  id: string,
  start: string,
  end: string,
  title: string,
  recurrence: InitOf<typeof pb.RecurrenceSchema>,
) {
  return create(pb.CalendarEventSchema, {
    id,
    kind: pb.EventKind.RESERVED,
    date: '2026-10-05',
    start,
    end,
    title,
    recurrence: create(pb.RecurrenceSchema, recurrence),
  });
}

describe('reservedByDay', () => {
  const sleep = reserved('s', '23:00', '07:00', 'Sleep', {
    unit: pb.RecurrenceUnit.DAY,
  });
  const work = reserved('w', '09:00', '17:00', 'Work', {
    unit: pb.RecurrenceUnit.WEEK,
    weekdays: [1, 2, 3, 4, 5],
  });
  const ordinary = create(pb.CalendarEventSchema, {
    id: 'e',
    date: '2026-10-12',
    start: '10:00',
    end: '11:00',
  });

  it('draws a reserved event past midnight at the end of its day and the start of the next', () => {
    const m = reservedByDay(
      [sleep, work, ordinary],
      ['2026-10-12', '2026-10-13'],
    );
    const pieces = (d: string) =>
      m
        .get(d)!
        .map(
          p => `${p.event.title} ${p.start}-${p.end}${p.tail ? ' tail' : ''}`,
        );
    // Monday: the tail of Sunday's sleep, then its own sleep and work.
    expect(pieces('2026-10-12')).toEqual([
      'Sleep 0-420 tail',
      'Sleep 1380-1440',
      'Work 540-1020',
    ]);
    expect(m.get('2026-10-12')![0].key).toBe('s@2026-10-11');
    expect(pieces('2026-10-13')).toHaveLength(3);
  });

  it('leaves out ordinary events, and days without reserved time', () => {
    const m = reservedByDay([work, ordinary], ['2026-10-11']);
    expect(m.get('2026-10-11')).toEqual([]); // Sunday
  });

  it('starts with the first occurrence', () => {
    const m = reservedByDay([sleep], ['2026-10-05']);
    // No tail from 4 Oct: it starts on 5 Oct.
    expect(m.get('2026-10-05')!.map(p => p.tail)).toEqual([false]);
  });
});

describe('moving and resizing reserved time', () => {
  // Sleep 23:00–07:00 from Mon 5 Oct: drawn 23:00–24:00 on the 5th, 0–7:00 on the 6th.
  const sleep = create(pb.CalendarEventSchema, {
    id: 's',
    kind: pb.EventKind.RESERVED,
    date: '2026-10-05',
    start: '23:00',
    end: '07:00',
    title: 'Sleep',
  });
  const [evening, morning] = [
    ...reservedByDay([sleep], ['2026-10-05']).get('2026-10-05')!,
    ...reservedByDay([sleep], ['2026-10-06']).get('2026-10-06')!,
  ];
  const gym = create(pb.CalendarEventSchema, {
    id: 'g',
    kind: pb.EventKind.RESERVED,
    date: '2026-10-05',
    start: '21:00',
    end: '23:00',
    title: 'Gym',
  });
  const day: ReservedSpan = reservedByDay([gym], ['2026-10-05']).get(
    '2026-10-05',
  )![0];

  it('moves the whole event by as much as the piece moved', () => {
    // The evening piece down an hour: 00:00–08:00 the next day.
    expect(movedReserved(evening, '2026-10-05', 24 * 60 - 0)).toEqual({
      date: '2026-10-06',
      start: '00:00',
      end: '08:00',
    });
    expect(movedReserved(evening, '2026-10-05', 22 * 60)).toEqual({
      date: '2026-10-05',
      start: '22:00',
      end: '06:00',
    });
    // The morning piece takes the evening along: 1h later is 00:00–08:00.
    expect(movedReserved(morning, '2026-10-06', 60)).toEqual({
      date: '2026-10-06',
      start: '00:00',
      end: '08:00',
    });
    // To another day.
    expect(movedReserved(morning, '2026-10-08', 0)).toEqual({
      date: '2026-10-07',
      start: '23:00',
      end: '07:00',
    });
  });

  it('lets a block within a day slide past midnight', () => {
    expect(movedReserved(day, '2026-10-05', 23 * 60)).toEqual({
      date: '2026-10-05',
      start: '23:00',
      end: '01:00',
    });
    expect(movedReserved(day, '2026-10-05', 22 * 60)).toEqual({
      date: '2026-10-05',
      start: '22:00',
      end: '23:59',
    });
  });

  it('resizes across midnight from either piece', () => {
    // The evening's top down to midnight: sleep starts at 00:00 the next day.
    expect(resizedReserved(evening, 'start', 24 * 60)).toEqual({
      date: '2026-10-06',
      start: '00:00',
      end: '07:00',
    });
    expect(resizedReserved(evening, 'start', 22 * 60 + 30)).toEqual({
      date: '2026-10-05',
      start: '22:30',
      end: '07:00',
    });
    // The evening's bottom up: it ends that evening.
    expect(resizedReserved(evening, 'end', 23 * 60 + 45)).toEqual({
      date: '2026-10-05',
      start: '23:00',
      end: '23:45',
    });
    // The morning's top down: it starts that morning.
    expect(resizedReserved(morning, 'start', 60)).toEqual({
      date: '2026-10-06',
      start: '01:00',
      end: '07:00',
    });
    // The morning's bottom up to midnight: it ends at midnight.
    expect(resizedReserved(morning, 'end', 0)).toEqual({
      date: '2026-10-05',
      start: '23:00',
      end: '23:59',
    });
    expect(resizedReserved(morning, 'end', 8 * 60)).toEqual({
      date: '2026-10-05',
      start: '23:00',
      end: '08:00',
    });
  });

  it('keeps an event under a day long', () => {
    expect(edgeLimits(evening).start).toEqual([7 * 60 + 15, 24 * 60]);
    expect(edgeLimits(morning).end).toEqual([0, 22 * 60 + 45]);
    expect(resizedReserved(morning, 'end', 23 * 60)).toEqual({
      date: '2026-10-05',
      start: '23:00',
      end: '22:45',
    });
    // Within a day, as before.
    expect(edgeLimits(day)).toEqual({
      start: [0, 22 * 60 + 45],
      end: [21 * 60 + 15, 24 * 60],
    });
    expect(resizedReserved(day, 'end', 24 * 60)).toEqual({
      date: '2026-10-05',
      start: '21:00',
      end: '23:59',
    });
  });
});
