import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {reservedByDay} from './reserved';
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
