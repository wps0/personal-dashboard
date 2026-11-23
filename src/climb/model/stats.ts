/**
 * @fileoverview The numbers after a session (docs/climbing.md, "Charts and
 * numbers" and "What the numbers mean"): climbs by grade against an average
 * session, the four numbers, and firsts.
 */

import {CLIMB_CHART_ROWS, CLIMB_COMPARE_DAYS} from '../../config';
import {
  type Climb,
  type ClimbData,
  type GradeSystem,
  type Session,
} from './data';
import {addDays} from './dates';
import {timestampMs} from '@bufbuild/protobuf/wkt';
import {scale} from './grades';
import {dayOf, rank} from './sessions';

/** Which sessions a session is compared with: at any gym, or at its own. */
export type Scope = 'all' | 'place';

/** A row of a chart by grade: this session (or period) and the average (or the period before). */
export interface GradeRow {
  label: string;
  now: number;
  /** null: nothing to compare with. */
  past: number | null;
}

export function climbsIn(data: ClimbData, sessionId: string): Climb[] {
  return data.sessions.find(s => s.id === sessionId)?.climbs ?? [];
}

function startMs(s: Session): number {
  return s.start ? timestampMs(s.start) : 0;
}

/** Whether `a` started before `b`. */
function before(a: Session, b: Session): boolean {
  return startMs(a) < startMs(b);
}

/**
 * The finished sessions before `session` in the CLIMB_COMPARE_DAYS days up
 * to it, at any gym or only at its own.
 */
export function comparedWith(
  data: ClimbData,
  session: Session,
  scope: Scope,
): Session[] {
  const from = addDays(dayOf(session), -CLIMB_COMPARE_DAYS);
  return data.sessions.filter(
    s =>
      s.id !== session.id &&
      s.end !== undefined &&
      dayOf(s) >= from &&
      before(s, session) &&
      (scope === 'all' || s.placeId === session.placeId),
  );
}

/** Climbs by rank on `system`'s scale. */
function byRank(climbs: readonly Climb[], system: GradeSystem) {
  const counts = new Map<number, number>();
  for (const c of climbs) {
    const r = rank(c, system);
    if (r >= 0) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return counts;
}

/**
 * Rows by grade, hardest first, for the grades either side has: at most
 * CLIMB_CHART_ROWS, the easiest summed into "5 and below".
 */
export function gradeRows(
  now: ReadonlyMap<number, number>,
  past: ReadonlyMap<number, number> | null,
  system: GradeSystem,
): GradeRow[] {
  const grades = scale(system);
  const ranks = [...new Set([...now.keys(), ...(past?.keys() ?? [])])].sort(
    (a, b) => b - a,
  );
  const rows = ranks.map(r => ({
    label: grades[r],
    now: now.get(r) ?? 0,
    past: past ? (past.get(r) ?? 0) : null,
  }));
  if (rows.length <= CLIMB_CHART_ROWS) return rows;
  const kept = rows.slice(0, CLIMB_CHART_ROWS - 1);
  const rest = rows.slice(CLIMB_CHART_ROWS - 1);
  kept.push({
    label: `${rest[0].label} and below`,
    now: rest.reduce((a, r) => a + r.now, 0),
    past: past ? rest.reduce((a, r) => a + (r.past ?? 0), 0) : null,
  });
  return kept;
}

/** A number this session and its average over the sessions compared with (null: none). */
export interface Compared {
  now: number;
  avg: number | null;
}

export interface SessionStats {
  rows: GradeRow[];
  /** How many sessions the average is over. */
  sessions: number;
  climbs: Compared;
  flashed: Compared;
  /** All tries ÷ climbs; fewer is better. */
  triesPerClimb: Compared;
  /** On the scale: the hardest grade; the average is of each session's hardest, as the nearest grade. */
  hardest: {now: string | undefined; avg: string | undefined};
}

function hardestRank(climbs: readonly Climb[], system: GradeSystem): number {
  return Math.max(-1, ...climbs.map(c => rank(c, system)));
}

export function sessionStats(
  data: ClimbData,
  session: Session,
  scope: Scope,
  system: GradeSystem,
): SessionStats {
  const grades = scale(system);
  const mine = climbsIn(data, session.id);
  const others = comparedWith(data, session, scope);
  const theirs = others.map(s => climbsIn(data, s.id));
  const n = others.length;
  const avg = (f: (c: Climb[]) => number) =>
    n ? theirs.reduce((a, c) => a + f(c), 0) / n : null;

  const past = n ? new Map<number, number>() : null;
  if (past)
    for (const c of theirs)
      for (const [r, k] of byRank(c, system))
        past.set(r, (past.get(r) ?? 0) + k / n);

  const flashes = (c: readonly Climb[]) => c.filter(x => x.tries <= 1).length;
  const tries = (c: readonly Climb[]) =>
    c.reduce((a, x) => a + Math.max(1, x.tries), 0);
  const all = theirs.flat();
  const top = hardestRank(mine, system);
  const avgTop = avg(c => hardestRank(c, system));
  return {
    rows: gradeRows(byRank(mine, system), past, system),
    sessions: n,
    climbs: {now: mine.length, avg: avg(c => c.length)},
    flashed: {now: flashes(mine), avg: avg(flashes)},
    triesPerClimb: {
      now: mine.length ? tries(mine) / mine.length : 0,
      avg: all.length ? tries(all) / all.length : null,
    },
    hardest: {
      now: top >= 0 ? grades[top] : undefined,
      avg:
        avgTop !== null && avgTop >= 0 ? grades[Math.round(avgTop)] : undefined,
    },
  };
}

/**
 * What's new in a session, against every earlier session: a grade above
 * any before, the most climbs of a grade or the most flashes
 * in a session. Empty for the first session.
 */
export function firsts(
  data: ClimbData,
  session: Session,
  system: GradeSystem,
): string[] {
  const grades = scale(system);
  const earlier = data.sessions.filter(
    s => s.id !== session.id && before(s, session),
  );
  if (!earlier.length) return [];
  const mine = climbsIn(data, session.id);
  const theirs = earlier.map(s => climbsIn(data, s.id));
  const out: string[] = [];

  const top = hardestRank(mine, system);
  const best = Math.max(-1, ...theirs.map(c => hardestRank(c, system)));
  if (top > best) {
    const first = mine.find(c => rank(c, system) === top)!;
    out.push(
      `Your first ${grades[top]}${first.tries <= 1 ? ', flashed' : `, in ${first.tries} tries`}`,
    );
  }

  const counts = byRank(mine, system);
  const most = [...counts.entries()]
    .filter(
      ([r, k]) =>
        k >= 2 && theirs.every(c => (byRank(c, system).get(r) ?? 0) < k),
    )
    .sort((a, b) => b[0] - a[0])[0];
  if (most)
    out.push(`${most[1]} climbs at ${grades[most[0]]}, your most in a session`);

  const flashes = mine.filter(c => c.tries <= 1).length;
  if (
    flashes >= 2 &&
    theirs.every(c => c.filter(x => x.tries <= 1).length < flashes)
  )
    out.push(`${flashes} flashes, your most in a session`);
  return out;
}

/** The latest finished session, if any. */
export function lastSession(data: ClimbData): Session | undefined {
  let last: Session | undefined;
  for (const s of data.sessions)
    if (s.end !== undefined && (!last || before(last, s))) last = s;
  return last;
}

/** Climbs, flashes and the hardest grade of the sessions in a month ("2026-11"), up to a day of it if given. */
export function monthStats(
  data: ClimbData,
  month: string,
  system: GradeSystem,
  upToDay = 31,
) {
  const last = `${month}-${String(upToDay).padStart(2, '0')}`;
  const sessions = data.sessions.filter(s => {
    const day = dayOf(s);
    return day.startsWith(month) && day <= last;
  });
  const climbs = sessions.flatMap(s => s.climbs);
  const top = hardestRank(climbs, system);
  return {
    sessions: sessions.length,
    climbs: climbs.length,
    flashedShare: climbs.length
      ? climbs.filter(c => c.tries <= 1).length / climbs.length
      : null,
    hardest: top >= 0 ? scale(system)[top] : undefined,
  };
}

/** Sessions by month ("2026-11"), newest first, each month's newest first. */
export function sessionsByMonth(
  data: ClimbData,
): {month: string; sessions: Session[]}[] {
  const sorted = [...data.sessions].sort((a, b) =>
    before(a, b) ? 1 : before(b, a) ? -1 : 0,
  );
  const out: {month: string; sessions: Session[]}[] = [];
  for (const s of sorted) {
    const month = dayOf(s).slice(0, 7);
    if (out.at(-1)?.month !== month) out.push({month, sessions: []});
    out.at(-1)!.sessions.push(s);
  }
  return out;
}

/** Sessions in each of the `weeks` weeks (from Monday) up to the one with `today`, oldest first. */
export function sessionsPerWeek(
  data: ClimbData,
  today: string,
  weeks: number,
): {from: string; count: number}[] {
  const [y, m, d] = today.split('-').map(Number);
  const back = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const monday = addDays(today, -back);
  return Array.from({length: weeks}, (_, i) => {
    const from = addDays(monday, -7 * (weeks - 1 - i));
    const to = addDays(from, 6);
    return {
      from,
      count: data.sessions.filter(s => dayOf(s) >= from && dayOf(s) <= to)
        .length,
    };
  });
}
