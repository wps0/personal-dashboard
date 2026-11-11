import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {capacityFor, defaultRules} from './capacity';
import {freeMinutes, spreadBackward, spreadDays} from './suggest';

/** Free minutes for consecutive days from Monday 9 Nov 2026. */
function free(...minutes: number[]) {
  return new Map(
    minutes.map((m, i) => [`2026-11-${String(9 + i).padStart(2, '0')}`, m]),
  );
}

/** The spread as "day:minutes", e.g. "12:105". */
function spread(hours: number, f: Map<string, number>) {
  const r = spreadBackward(hours, f);
  return {
    sessions: r.sessions.map(s => `${s.date.slice(8)}:${s.hours * 60}`),
    short: r.short * 60,
  };
}

describe('spreadDays', () => {
  it('runs from today to the day before the due date', () => {
    expect(spreadDays('2026-11-13', '2026-11-09')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
    expect(spreadDays('2026-11-10', '2026-11-09')).toEqual(['2026-11-09']);
  });

  it('has nothing for a task due today or earlier', () => {
    expect(spreadDays('2026-11-09', '2026-11-09')).toEqual([]);
    expect(spreadDays('2026-11-01', '2026-11-09')).toEqual([]);
  });

  it('looks back six weeks at most', () => {
    const days = spreadDays('2027-03-01', '2026-11-09');
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2027-01-18');
    expect(days.at(-1)).toBe('2027-02-28');
  });
});

describe('spreadBackward', () => {
  it('gives the latest days about equal sessions, two hours at most', () => {
    // Due Fri 13: Thu, Wed, Tue get 5h; Mon stays free.
    expect(spread(5, free(180, 180, 180, 180))).toEqual({
      sessions: ['10:90', '11:105', '12:105'],
      short: 0,
    });
    expect(spread(2, free(180, 180))).toEqual({sessions: ['10:120'], short: 0});
    // 2h 20m: two sessions, the last one shorter.
    expect(spread(140 / 60, free(180, 180, 180))).toEqual({
      sessions: ['10:65', '11:75'],
      short: 0,
    });
  });

  it('takes what a busy day has, and skips a day with too little', () => {
    // Thu has 45 min, Wed 15 (too little for a session), Tue and Mon plenty.
    expect(spread(4, free(180, 180, 15, 45))).toEqual({
      sessions: ['09:75', '10:120', '12:45'],
      short: 0,
    });
  });

  it('fills the free time left, the latest days first, when sessions aren’t enough', () => {
    expect(spread(6, free(240, 240))).toEqual({
      sessions: ['09:120', '10:240'],
      short: 0,
    });
  });

  it('says how much doesn’t fit', () => {
    expect(spread(6, free(60, 120))).toEqual({
      sessions: ['09:60', '10:120'],
      short: 180,
    });
    expect(spread(1, new Map())).toEqual({sessions: [], short: 60});
  });

  it('places a last bit shorter than a session', () => {
    expect(spread(20 / 60, free(180))).toEqual({sessions: ['09:20'], short: 0});
  });

  it('suggests nothing for nothing', () => {
    expect(spread(0, free(180))).toEqual({sessions: [], short: 0});
  });
});

describe('freeMinutes', () => {
  // Mon 9 Nov: the default 18:00–21:00 window, 3h.
  const capacity = capacityFor('2026-11-09', defaultRules(), {}, []);
  const session = (plannedHours: number, start?: string) =>
    create(pb.AllocationSchema, {
      id: 'a',
      itemId: 'i',
      date: '2026-11-09',
      plannedHours,
      start,
    });

  it('is the capacity less what’s planned, in quarter hours', () => {
    expect(freeMinutes(capacity, [])).toBe(180);
    expect(freeMinutes(capacity, [session(1)])).toBe(120);
    // 1h 10m planned leaves 1h 50m: 1h 45m in quarter hours.
    expect(freeMinutes(capacity, [session(70 / 60)])).toBe(105);
    // A time block at noon is outside the window.
    expect(freeMinutes(capacity, [session(2, '12:00')])).toBe(180);
    expect(freeMinutes(capacity, [session(4)])).toBe(0);
  });

  it('today: no more than what’s left of the window', () => {
    expect(freeMinutes(capacity, [], 10 * 60)).toBe(180);
    expect(freeMinutes(capacity, [], 20 * 60 + 10)).toBe(45);
    expect(freeMinutes(capacity, [], 22 * 60)).toBe(0);
  });
});
