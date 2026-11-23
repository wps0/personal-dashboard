import {create} from '@bufbuild/protobuf';
import {timestampFromDate} from '@bufbuild/protobuf/wkt';
import {describe, expect, it} from 'vitest';
import * as pb from '../../gen/climb/climb_pb';
import {emptyData, GradeSystem, type ClimbData} from './data';
import {gradeOf} from './grades';
import {addPlace} from './places';
import {
  comparedWith,
  firsts,
  gradeRows,
  lastSession,
  monthStats,
  sessionStats,
} from './stats';

const FONT = GradeSystem.FONT;

/**
 * Sessions at gym A or B, by local start ("2026-11-10T18:00"), two hours
 * long, each with climbs as [grade, tries].
 */
function fixture(
  sessions: [string, string, [string, number][]][],
): ClimbData {
  const [a, gymA] = addPlace(emptyData(), 'A');
  const [data, gymB] = addPlace(a, 'B');
  const ids: Record<string, string> = {A: gymA, B: gymB};
  sessions.forEach(([place, start, climbs], i) => {
    const from = new Date(start);
    data.sessions.push(
      create(pb.SessionSchema, {
        id: `s${i}`,
        placeId: ids[place],
        start: timestampFromDate(from),
        end: timestampFromDate(new Date(from.getTime() + 2 * 3_600_000)),
        climbs: climbs.map(([grade, tries], j) =>
          create(pb.ClimbSchema, {
            id: `s${i}c${j}`,
            at: timestampFromDate(from),
            grade: gradeOf(FONT, grade),
            tries,
          }),
        ),
      }),
    );
  });
  return data;
}

describe('after a session', () => {
  const data = fixture([
    ['A', '2026-10-01T18:00', [['6A', 1]]], // more than 30 days before
    [
      'A',
      '2026-11-10T18:00',
      [
        ['6A', 1],
        ['6A+', 2],
      ],
    ],
    [
      'B',
      '2026-11-14T18:00',
      [
        ['6A', 3],
        ['5+', 1],
        ['6B', 4],
        ['6A', 1],
      ],
    ],
    [
      'A',
      '2026-11-21T18:00',
      [
        ['6C', 5],
        ['6B', 1],
        ['6B', 2],
        ['6A', 1],
      ],
    ],
  ]);
  const tonight = data.sessions[3];

  it('is compared with the sessions of the 30 days before, anywhere or at its gym', () => {
    expect(comparedWith(data, tonight, 'all').map(s => s.id)).toEqual([
      's1',
      's2',
    ]);
    expect(comparedWith(data, tonight, 'place').map(s => s.id)).toEqual(['s1']);
  });

  it('shows climbs by grade against the average session, and the numbers', () => {
    const s = sessionStats(data, tonight, 'all', FONT);
    expect(s.sessions).toBe(2);
    expect(s.rows).toEqual([
      {label: '6C', now: 1, past: 0},
      {label: '6B', now: 2, past: 0.5},
      {label: '6A+', now: 0, past: 0.5},
      {label: '6A', now: 1, past: 1.5},
      {label: '5+', now: 0, past: 0.5},
    ]);
    expect(s.climbs).toEqual({now: 4, avg: 3});
    expect(s.flashed).toEqual({now: 2, avg: 1.5});
    expect(s.triesPerClimb.now).toBe(9 / 4);
    expect(s.triesPerClimb.avg).toBe(12 / 6);
    expect(s.hardest).toEqual({now: '6C', avg: '6B'});
  });

  it('has nothing to compare with in a first session', () => {
    const s = sessionStats(data, data.sessions[0], 'all', FONT);
    expect(s.sessions).toBe(0);
    expect(s.rows).toEqual([{label: '6A', now: 1, past: null}]);
    expect(s.climbs.avg).toBeNull();
  });

  it('names what’s new: a grade above any before, the most at a grade', () => {
    expect(firsts(data, tonight, FONT)).toEqual([
      'Your first 6C, in 5 tries',
      '2 climbs at 6B, your most in a session',
    ]);
    expect(firsts(data, data.sessions[0], FONT)).toEqual([]);
  });
});

describe('charts by grade', () => {
  it('sum the easiest grades beyond the rows a chart has', () => {
    const now = new Map([
      [11, 1],
      [10, 1],
      [9, 1],
      [8, 1],
      [7, 1],
      [6, 1],
      [5, 2],
      [4, 3],
    ]);
    const rows = gradeRows(now, null, FONT);
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)).toEqual({label: '6A and below', now: 5, past: null});
  });
});

describe('Today', () => {
  it('has the last session, and the month’s numbers', () => {
    const data = fixture([
      [
        'A',
        '2026-11-10T18:00',
        [
          ['6A', 1],
          ['6B', 2],
        ],
      ],
      ['B', '2026-11-16T11:00', [['7A', 2]]],
    ]);
    expect(lastSession(data)?.id).toBe('s1');
    expect(monthStats(data, '2026-11', FONT)).toEqual({
      sessions: 2,
      climbs: 3,
      flashedShare: 1 / 3,
      hardest: '7A',
    });
    expect(monthStats(data, '2026-11', FONT, 15).climbs).toBe(2);
  });
});
