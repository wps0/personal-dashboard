import { describe, expect, it } from 'vitest';
import { fromMinutes, layoutSpans, snap, toMinutes } from './time';

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
      { id: 'a', start: 600, end: 720 }, // 10–12
      { id: 'b', start: 630, end: 660 }, // 10:30–11, overlaps a
      { id: 'c', start: 690, end: 750 }, // 11:30–12:30, overlaps a, reuses b's lane
      { id: 'd', start: 800, end: 860 }, // separate
    ]);
    expect(l.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(l.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(l.get('c')).toEqual({ lane: 1, lanes: 2 });
    expect(l.get('d')).toEqual({ lane: 0, lanes: 1 });
  });

  it('treats touching spans as non-overlapping', () => {
    const l = layoutSpans([
      { id: 'a', start: 600, end: 660 },
      { id: 'b', start: 660, end: 720 },
    ]);
    expect(l.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(l.get('b')).toEqual({ lane: 0, lanes: 1 });
  });
});
