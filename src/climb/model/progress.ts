/**
 * @fileoverview Progress over a period (docs/climbing.md, "Charts and
 * numbers"): the period and the one it's compared with, the numbers, climbs
 * and tries by grade, climbs per week by grade, and the grade trend.
 */

import {CLIMB_COLUMN_GROUPS, CLIMB_MAX_WEEKS, CLIMB_TOP_N} from '../../config';
import type {Climb, ClimbData, GradeSystem, Session} from './data';
import {addDays, isoDate, monthName, shortDate} from './dates';
import {scale} from './grades';
import {rank} from './sessions';
import {dayOf} from './sessions';
import {gradeRows, type GradeRow} from './stats';

/** Dates from and to, both included. */
export interface Period {
  from: string;
  to: string;
}

export type Preset = '30d' | '3m' | 'year' | 'all' | 'dates';
export type CompareWith = 'before' | 'year' | 'none';

/** Which sessions Progress counts: all gyms, or only `placeId`'s. */
export interface Filter {
  placeId?: string;
}

function daysBetween(from: string, to: string): number {
  const t = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((t(to) - t(from)) / 86_400_000);
}

/** The period a preset means on `today`; "all time" starts at the first session. */
export function presetPeriod(
  preset: Exclude<Preset, 'dates'>,
  today: string,
  data: ClimbData,
): Period {
  switch (preset) {
    case '30d':
      return {from: addDays(today, -29), to: today};
    case '3m':
      return {from: addDays(today, -90), to: today};
    case 'year':
      return {from: `${today.slice(0, 4)}-01-01`, to: today};
    case 'all': {
      const first = data.sessions.reduce(
        (a, s) => (dayOf(s) < a ? dayOf(s) : a),
        today,
      );
      return {from: first, to: today};
    }
    default:
      return {from: today, to: today};
  }
}

/** The period compared with: the same length just before, the same dates a year earlier, or none. */
export function comparisonOf(
  period: Period,
  compare: CompareWith,
): Period | null {
  switch (compare) {
    case 'before': {
      const days = daysBetween(period.from, period.to) + 1;
      return {from: addDays(period.from, -days), to: addDays(period.from, -1)};
    }
    case 'year': {
      const back = (d: string) =>
        `${Number(d.slice(0, 4)) - 1}${d.slice(4) === '-02-29' ? '-02-28' : d.slice(4)}`;
      return {from: back(period.from), to: back(period.to)};
    }
    default:
      return null;
  }
}

/** "23 Aug – 23 Nov 2026" (both years when they differ). */
export function periodText(p: Period): string {
  const day = (d: string) => shortDate(d).replace(/^\w+ /, '');
  const [a, b] = [p.from.slice(0, 4), p.to.slice(0, 4)];
  return a === b
    ? `${day(p.from)} – ${day(p.to)} ${b}`
    : `${day(p.from)} ${a} – ${day(p.to)} ${b}`;
}

/** The finished sessions in a period that match the filter. */
export function sessionsIn(
  data: ClimbData,
  period: Period,
  filter: Filter,
): Session[] {
  return data.sessions.filter(
    s =>
      s.end !== undefined &&
      dayOf(s) >= period.from &&
      dayOf(s) <= period.to &&
      (!filter.placeId || s.placeId === filter.placeId),
  );
}

function climbsOfSessions(sessions: readonly Session[]) {
  return sessions.flatMap(s => s.climbs);
}

function ranks(climbs: readonly Climb[], system: GradeSystem): number[] {
  return climbs.map(c => rank(c, system)).filter(r => r >= 0);
}

/** The median rank (the lower of the middle two). */
function median(rs: readonly number[]): number | null {
  if (!rs.length) return null;
  const sorted = [...rs].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** The average rank of the CLIMB_TOP_N hardest (of all, with fewer). */
function topAverage(rs: readonly number[]): number | null {
  if (!rs.length) return null;
  const top = [...rs].sort((a, b) => b - a).slice(0, CLIMB_TOP_N);
  return top.reduce((a, r) => a + r, 0) / top.length;
}

export interface Numbers {
  climbs: number;
  sessions: number;
  perSession: number | null;
  /** Ranks on the scale; null with no climbs. */
  typical: number | null;
  top: number | null;
  hardest: number | null;
  flashedShare: number | null;
  triesPerClimb: number | null;
}

export function numbersOf(
  data: ClimbData,
  period: Period,
  filter: Filter,
  system: GradeSystem,
): Numbers {
  const sessions = sessionsIn(data, period, filter);
  const climbs = climbsOfSessions(sessions);
  const rs = ranks(climbs, system);
  const top = topAverage(rs);
  const tries = climbs.reduce((a, c) => a + Math.max(1, c.tries), 0);
  return {
    climbs: climbs.length,
    sessions: sessions.length,
    perSession: sessions.length ? climbs.length / sessions.length : null,
    typical: median(rs),
    top: top === null ? null : Math.round(top),
    hardest: rs.length ? Math.max(...rs) : null,
    flashedShare: climbs.length
      ? climbs.filter(c => c.tries <= 1).length / climbs.length
      : null,
    triesPerClimb: climbs.length ? tries / climbs.length : null,
  };
}

function countByRank(climbs: readonly Climb[], system: GradeSystem) {
  const m = new Map<number, number>();
  for (const r of ranks(climbs, system)) m.set(r, (m.get(r) ?? 0) + 1);
  return m;
}

/** Climbs by grade in the period (now) and the comparison (past), hardest first. */
export function byGrade(
  data: ClimbData,
  period: Period,
  compared: Period | null,
  filter: Filter,
  system: GradeSystem,
): GradeRow[] {
  const now = countByRank(
    climbsOfSessions(sessionsIn(data, period, filter)),
    system,
  );
  const past = compared
    ? countByRank(climbsOfSessions(sessionsIn(data, compared, filter)), system)
    : null;
  return gradeRows(now, past, system);
}

/**
 * Average tries to top, by grade, in the period and the comparison; past is
 * null for a grade not climbed then. Grades with no climbs now are left out.
 */
export function triesByGrade(
  data: ClimbData,
  period: Period,
  compared: Period | null,
  filter: Filter,
  system: GradeSystem,
): GradeRow[] {
  const avgByRank = (climbs: readonly Climb[]) => {
    const sum = new Map<number, [number, number]>();
    for (const c of climbs) {
      const r = rank(c, system);
      if (r < 0) continue;
      const [t, n] = sum.get(r) ?? [0, 0];
      sum.set(r, [t + Math.max(1, c.tries), n + 1]);
    }
    return new Map([...sum].map(([r, [t, n]]) => [r, t / n]));
  };
  const now = avgByRank(climbsOfSessions(sessionsIn(data, period, filter)));
  const past = compared
    ? avgByRank(climbsOfSessions(sessionsIn(data, compared, filter)))
    : null;
  const grades = scale(system);
  return [...now.keys()]
    .sort((a, b) => b - a)
    .map(r => ({
      label: grades[r],
      now: Math.round(now.get(r)! * 10) / 10,
      past: past?.has(r) ? Math.round(past.get(r)! * 10) / 10 : null,
    }));
}

/** A column of the charts over time: a week (from Monday) or a month. */
export interface Bucket {
  from: string;
  to: string;
  label: string;
}

/** The weeks of a period, or its months when there are too many weeks. */
export function bucketsOf(period: Period): Bucket[] {
  const out: Bucket[] = [];
  const weeks = daysBetween(period.from, period.to) / 7;
  if (weeks <= CLIMB_MAX_WEEKS) {
    const [y, m, d] = period.from.split('-').map(Number);
    const first = new Date(y, m - 1, d);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    for (let start = isoDate(first); start <= period.to;) {
      const end = addDays(start, 6);
      out.push({
        from: start,
        to: end,
        label: shortDate(start).replace(/^\w+ /, ''),
      });
      start = addDays(start, 7);
    }
    return out;
  }
  let [y, m] = period.from.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= period.to.slice(0, 7)) {
    const month = `${y}-${String(m).padStart(2, '0')}`;
    out.push({
      from: `${month}-01`,
      to: `${month}-31`,
      label: `${monthName(m - 1).slice(0, 3)}${m === 1 ? ` ${y}` : ''}`,
    });
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}

export interface Columns {
  /** The grade groups, easiest first: "≤5", "5+", …, "6B+ ↑". */
  groups: string[];
  columns: {label: string; counts: number[]}[];
}

/**
 * Climbs per bucket, stacked by grade group: the CLIMB_COLUMN_GROUPS grades
 * up to the one 95% of climbs are at or below, the easiest group taking
 * everything below and the hardest everything above.
 */
export function columnsOf(
  data: ClimbData,
  period: Period,
  filter: Filter,
  system: GradeSystem,
): Columns {
  const grades = scale(system);
  const sessions = sessionsIn(data, period, filter);
  const all = ranks(climbsOfSessions(sessions), system).sort((a, b) => a - b);
  const hi = all.length
    ? Math.max(
        CLIMB_COLUMN_GROUPS - 1,
        all[Math.floor((all.length - 1) * 0.95)],
      )
    : CLIMB_COLUMN_GROUPS - 1;
  const lo = hi - (CLIMB_COLUMN_GROUPS - 1);
  const groups = Array.from({length: CLIMB_COLUMN_GROUPS}, (_, i) => {
    const g = grades[lo + i];
    if (i === 0) return `≤${g}`;
    if (i === CLIMB_COLUMN_GROUPS - 1) return `${g} ↑`;
    return g;
  });
  const columns = bucketsOf(period).map(b => {
    const counts = new Array<number>(CLIMB_COLUMN_GROUPS).fill(0);
    const inside = sessions.filter(s => dayOf(s) >= b.from && dayOf(s) <= b.to);
    for (const r of ranks(climbsOfSessions(inside), system))
      counts[Math.max(0, Math.min(CLIMB_COLUMN_GROUPS - 1, r - lo))]++;
    return {label: b.label, counts};
  });
  return {groups, columns};
}

/** Per bucket: the typical (median) grade and the top-N average, as ranks; null with no climbs. */
export function trendOf(
  data: ClimbData,
  period: Period,
  filter: Filter,
  system: GradeSystem,
): {label: string; typical: number | null; top: number | null}[] {
  const sessions = sessionsIn(data, period, filter);
  return bucketsOf(period).map(b => {
    const inside = sessions.filter(s => dayOf(s) >= b.from && dayOf(s) <= b.to);
    const rs = ranks(climbsOfSessions(inside), system);
    return {label: b.label, typical: median(rs), top: topAverage(rs)};
  });
}
