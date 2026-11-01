import {describe, expect, it} from 'vitest';
import {
  fromMinutes,
  layoutSpans,
  moveStart,
  parseTime,
  slotRange,
  snap,
  toMinutes,
} from './time';

describe('time', () => {
  it('converts HH:MM and minutes', () => {
    expect(toMinutes('10:15')).toBe(615);
    expect(fromMinutes(615)).toBe('10:15');
    expect(fromMinutes(-5)).toBe('00:00');
    expect(fromMinutes(24 * 60 + 10)).toBe('23:59');
    expect(snap(622)).toBe(615);
    expect(snap(623)).toBe(630);
  });

  it('lays out overlapping spans side by side, per cluster', () => {
    const l = layoutSpans([
      {id: 'a', start: 600, end: 720}, // 10–12
      {id: 'b', start: 630, end: 660}, // 10:30–11, overlaps a
      {id: 'c', start: 690, end: 750}, // 11:30–12:30, overlaps a, reuses b's lane
      {id: 'd', start: 800, end: 860}, // separate
    ]);
    expect(l.get('a')).toEqual({lane: 0, lanes: 2});
    expect(l.get('b')).toEqual({lane: 1, lanes: 2});
    expect(l.get('c')).toEqual({lane: 1, lanes: 2});
    expect(l.get('d')).toEqual({lane: 0, lanes: 1});
  });

  it('treats touching spans as non-overlapping', () => {
    const l = layoutSpans([
      {id: 'a', start: 600, end: 660},
      {id: 'b', start: 660, end: 720},
    ]);
    expect(l.get('a')).toEqual({lane: 0, lanes: 1});
    expect(l.get('b')).toEqual({lane: 0, lanes: 1});
  });
});

describe('slotRange', () => {
  it('covers whole 15-minute slots, at least one', () => {
    expect(slotRange(782, 790)).toEqual([780, 795]); // tiny drag inside 13:00–13:15
    expect(slotRange(790, 782)).toEqual([780, 795]); // upwards
    expect(slotRange(780, 815)).toEqual([780, 825]); // 13:00 → 13:35 covers three slots
    expect(slotRange(1435, 1440)).toEqual([1425, 1440]); // clamped at midnight
  });
});

describe('moveStart', () => {
  it('keeps the length', () => {
    expect(moveStart({start: '08:00', end: '20:00'}, '09:30')).toEqual({
      start: '09:30',
      end: '21:30',
    });
    // Past the old end: a planning window no longer collapses to 0h.
    expect(moveStart({start: '08:00', end: '10:00'}, '21:00')).toEqual({
      start: '21:00',
      end: '23:00',
    });
  });

  it('stays within the day, 23:59 meaning midnight', () => {
    expect(moveStart({start: '08:00', end: '20:00'}, '21:00')).toEqual({
      start: '21:00',
      end: '23:59',
    });
    expect(moveStart({start: '21:00', end: '23:59'}, '18:00')).toEqual({
      start: '18:00',
      end: '21:00',
    });
  });

  it('gives an empty or inverted range 15 min', () => {
    expect(moveStart({start: '10:00', end: '10:00'}, '12:00')).toEqual({
      start: '12:00',
      end: '12:15',
    });
    expect(moveStart({start: '10:00', end: '09:00'}, '12:00')).toEqual({
      start: '12:00',
      end: '12:15',
    });
  });
});

describe('parseTime', () => {
  it('reads times however they are typed', () => {
    const cases: [string, string][] = [
      ['9', '09:00'],
      ['09', '09:00'],
      ['930', '09:30'],
      ['0930', '09:30'],
      ['9:30', '09:30'],
      ['09:07', '09:07'],
      ['9.07', '09:07'],
      ['21:53', '21:53'],
      [' 21 : 53 ', '21:53'],
      ['0', '00:00'],
      ['23:59', '23:59'],
      ['9pm', '21:00'],
      ['9:15 pm', '21:15'],
      ['12am', '00:00'],
      ['12pm', '12:00'],
      ['7a.m.', '07:00'],
    ];
    for (const [typed, time] of cases)
      expect(parseTime(typed), typed).toBe(time);
  });

  it('refuses what is not a time of day', () => {
    for (const typed of [
      '',
      '24',
      '24:00',
      '9:60',
      '13pm',
      '0am',
      'abc',
      '9:5',
      '12345',
      '-1',
    ])
      expect(parseTime(typed), typed).toBeNull();
  });
});
