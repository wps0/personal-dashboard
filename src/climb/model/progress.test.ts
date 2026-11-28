import {create} from '@bufbuild/protobuf';
import {timestampFromDate} from '@bufbuild/protobuf/wkt';
import {describe, expect, it} from 'vitest';
import * as pb from '../../gen/climb/climb_pb';
import {emptyData, GradeSystem, type ClimbData} from './data';
import {gradeOf} from './grades';
import {addPlace} from './places';
import {
  bucketsOf,
  byGrade,
  columnsOf,
  comparisonOf,
  numbersOf,
  periodText,
  presetPeriod,
  trendOf,
  triesByGrade,
} from './progress';

const FONT = GradeSystem.FONT;
const ALL = {};

/** Sessions at gym A (and one at B), each with climbs as [grade, tries]. */
function fixture(): ClimbData {
  const [withA, gymA] = addPlace(emptyData(), 'A');
  const [data, gymB] = addPlace(withA, 'B');
  const sessions: [string, string, [string, number][]][] = [
    [
      gymA,
      '2026-10-05T18:00',
      [
        ['6A', 1],
        ['6A', 3],
        ['5+', 1],
      ],
    ],
    [
      gymA,
      '2026-11-02T18:00',
      [
        ['6A', 1],
        ['6B', 2],
        ['6A+', 1],
        ['5+', 1],
      ],
    ],
    [
      gymA,
      '2026-11-16T18:00',
      [
        ['6B', 1],
        ['6B+', 4],
        ['6A', 1],
        ['6C', 6],
        ['6A+', 2],
        ['5', 1],
      ],
    ],
    [gymB, '2026-11-17T18:00', [['7A', 2]]],
  ];
  sessions.forEach(([placeId, start, climbs], i) => {
    const from = new Date(start);
    data.sessions.push(
      create(pb.SessionSchema, {
        id: `s${i}`,
        placeId,
        start: timestampFromDate(from),
        end: timestampFromDate(new Date(from.getTime() + 7_200_000)),
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

describe('periods', () => {
  it('come from presets, and are compared with the same length before or a year earlier', () => {
    const data = fixture();
    expect(presetPeriod('30d', '2026-11-23', data)).toEqual({
      from: '2026-10-25',
      to: '2026-11-23',
    });
    expect(presetPeriod('year', '2026-11-23', data).from).toBe('2026-01-01');
    expect(presetPeriod('all', '2026-11-23', data).from).toBe('2026-10-05');
    const p = {from: '2026-11-01', to: '2026-11-30'};
    expect(comparisonOf(p, 'before')).toEqual({
      from: '2026-10-02',
      to: '2026-10-31',
    });
    expect(comparisonOf(p, 'year')).toEqual({
      from: '2025-11-01',
      to: '2025-11-30',
    });
    expect(comparisonOf(p, 'none')).toBeNull();
    expect(periodText(p)).toBe('1 Nov – 30 Nov 2026');
    expect(periodText({from: '2025-12-01', to: '2026-01-31'})).toBe(
      '1 Dec 2025 – 31 Jan 2026',
    );
  });

  it('go by week, or by month when long', () => {
    const weeks = bucketsOf({from: '2026-11-04', to: '2026-11-23'});
    expect(weeks.map(b => b.from)).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
    const months = bucketsOf({from: '2025-11-10', to: '2026-11-23'});
    expect(months[0].label).toBe('Nov');
    expect(months[2].label).toBe('Jan 2026');
    expect(months).toHaveLength(13);
  });
});

describe('numbers over a period', () => {
  const data = fixture();
  const GYM_A = {placeId: data.places[0].id};
  const nov = {from: '2026-11-01', to: '2026-11-30'};
  const oct = {from: '2026-10-01', to: '2026-10-31'};

  it('count climbs and sessions at gyms, with the typical, top-5 and hardest grades', () => {
    const n = numbersOf(data, nov, GYM_A, FONT);
    expect(n.climbs).toBe(10);
    expect(n.sessions).toBe(2);
    expect(n.perSession).toBe(5);
    // Ranks: 5+=4, 6A=5, 6A+=6, 6B=7, 6B+=8, 6C=9.
    expect(n.typical).toBe(6);
    expect(n.top).toBe(7); // (9 + 8 + 7 + 7 + 6) / 5 = 7.4
    expect(n.hardest).toBe(9);
    expect(n.flashedShare).toBe(0.6);
    expect(n.triesPerClimb).toBe(20 / 10);
    expect(
      numbersOf(data, nov, {placeId: data.places[1].id}, FONT).climbs,
    ).toBe(1);
    expect(numbersOf(data, nov, ALL, FONT).climbs).toBe(11);
  });

  it('give climbs and tries by grade against the comparison', () => {
    const rows = byGrade(data, nov, oct, GYM_A, FONT);
    expect(rows.find(r => r.label === '6A')).toEqual({
      label: '6A',
      now: 2,
      past: 2,
    });
    const tries = triesByGrade(data, nov, oct, GYM_A, FONT);
    expect(tries.find(r => r.label === '6A')).toEqual({
      label: '6A',
      now: 1,
      past: 2,
    });
    expect(tries.find(r => r.label === '6C')).toEqual({
      label: '6C',
      now: 6,
      past: null,
    });
  });

  it('stack climbs per week by grade group, and follow the grades week by week', () => {
    const cols = columnsOf(data, nov, GYM_A, FONT);
    expect(cols.groups).toHaveLength(6);
    expect(cols.groups.at(-1)).toMatch(/↑$/);
    // The first week starts on Monday 26 Oct.
    expect(cols.columns.map(c => c.counts.reduce((a, n) => a + n, 0))).toEqual([
      0, 4, 0, 6, 0, 0,
    ]);
    const trend = trendOf(data, nov, GYM_A, FONT);
    expect(trend[0]).toMatchObject({typical: null, top: null});
    expect(trend[1].typical).toBe(5);
  });
});
