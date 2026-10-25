import {describe, expect, it} from 'vitest';
import type {GEvent} from './events';
import {layoutAllDay} from './spans';

const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];

/** The per-day pieces of an all-day event from `first` to `last`. */
function event(id: string, first: string, last: string): GEvent[] {
  const out: GEvent[] = [];
  for (
    let d = new Date(`${first}T00:00`);
    d <= new Date(`${last}T00:00`);
    d.setDate(d.getDate() + 1)
  ) {
    const date = d.toLocaleDateString('en-CA');
    out.push({
      key: `c|${id}|${date}`,
      id,
      calendarId: 'c',
      calendarName: 'c',
      title: id,
      date,
      first,
      last,
      allDay: true,
      startMin: 0,
      endMin: 1440,
      color: '#000',
      calendarColor: '#000',
      busy: false,
      declined: false,
      when: '',
    });
  }
  return out;
}

function byDay(...events: GEvent[][]) {
  const m = new Map<string, GEvent[]>();
  for (const e of events.flat()) m.set(e.date, [...(m.get(e.date) ?? []), e]);
  return m;
}

describe('layoutAllDay', () => {
  it('draws a multi-day event as one span and keeps single days apart', () => {
    const {spans, lanes, singles} = layoutAllDay(
      days,
      byDay(
        event('trip', '2026-10-13', '2026-10-14'),
        event('bday', '2026-10-12', '2026-10-12'),
      ),
    );
    expect(spans.map(s => [s.ev.id, s.start, s.end, s.lane])).toEqual([
      ['trip', 1, 2, 0],
    ]);
    expect(lanes).toBe(1);
    expect(singles.get('2026-10-12')!.map(e => e.id)).toEqual(['bday']);
    expect(singles.get('2026-10-13')).toEqual([]);
  });

  it('marks spans that continue past the visible days', () => {
    const {spans} = layoutAllDay(
      days,
      byDay(event('reg', '2026-10-05', '2026-10-20')),
    );
    expect(spans).toMatchObject([
      {start: 0, end: 3, before: true, after: true},
    ]);
  });

  it('stacks overlapping spans in lanes, reusing free ones, longest first', () => {
    const {spans, lanes} = layoutAllDay(
      days,
      byDay(
        event('a', '2026-10-12', '2026-10-13'),
        event('long', '2026-10-12', '2026-10-15'),
        event('c', '2026-10-14', '2026-10-15'),
      ),
    );
    expect(spans.map(s => [s.ev.id, s.lane])).toEqual([
      ['long', 0],
      ['a', 1],
      ['c', 1],
    ]);
    expect(lanes).toBe(2);
  });

  it('treats each event of each calendar separately', () => {
    const other = event('trip', '2026-10-12', '2026-10-13').map(e => ({
      ...e,
      calendarId: 'other',
    }));
    const {spans} = layoutAllDay(
      days,
      byDay(event('trip', '2026-10-12', '2026-10-13'), other),
    );
    expect(spans).toHaveLength(2);
  });
});
