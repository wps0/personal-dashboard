/**
 * @fileoverview Sessions and the climbs logged in them: pure edits that
 * return new data. A session runs from Start to Finish (its end unset while
 * it runs); a climb is one problem topped, with its grade and tries.
 */

import {create} from '@bufbuild/protobuf';
import {
  timestampDate,
  timestampFromDate,
  type Timestamp,
} from '@bufbuild/protobuf/wkt';
import * as pb from '../../gen/climb/climb_pb';
import {
  newId,
  type Climb,
  type ClimbData,
  type Grade,
  type GradeSystem,
  type Session,
} from './data';
import {hhmm, isoDate} from './dates';
import {rankOf, scale} from './grades';

/** The last of `list` that `test` accepts. */
function lastOf<T>(list: readonly T[], test: (t: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i];
  return undefined;
}

/** The session that's running, if any (the latest, should there be more). */
export function runningSession(data: ClimbData): Session | undefined {
  return lastOf(data.sessions, s => s.end === undefined);
}

export function sessionById(data: ClimbData, id: string): Session | undefined {
  return data.sessions.find(s => s.id === id);
}

/**
 * The gym to offer for the next session: where the last one was, unless
 * it's archived or gone; else the first gym.
 */
export function nextPlaceId(data: ClimbData): string | undefined {
  const open = data.places.filter(p => !p.archived);
  const last = lastOf(data.sessions, s => open.some(p => p.id === s.placeId));
  return last?.placeId ?? open[0]?.id;
}

/** Starts a session at a gym; returns it with the data. */
export function startSession(
  data: ClimbData,
  placeId: string,
  now: Date,
): [ClimbData, string] {
  const session = create(pb.SessionSchema, {
    id: newId(),
    placeId,
    start: timestampFromDate(now),
  });
  return [{...data, sessions: [...data.sessions, session]}, session.id];
}

function updateSession(
  data: ClimbData,
  id: string,
  change: (s: Session) => Session,
): ClimbData {
  return {
    ...data,
    sessions: data.sessions.map(s => (s.id === id ? change(s) : s)),
  };
}

/**
 * Finishes a session. One with no climbs isn't kept: there's nothing to
 * look back on.
 */
export function finishSession(
  data: ClimbData,
  id: string,
  now: Date,
): ClimbData {
  if (!sessionById(data, id)?.climbs.length) return deleteSession(data, id);
  return updateSession(data, id, s => ({...s, end: timestampFromDate(now)}));
}

export function setNotes(data: ClimbData, id: string, notes: string) {
  return updateSession(data, id, s => ({...s, notes}));
}

/** Deletes a session and its climbs. */
export function deleteSession(data: ClimbData, id: string): ClimbData {
  return {...data, sessions: data.sessions.filter(s => s.id !== id)};
}

/** Logs a climb topped in `tries` tries (1: a flash); returns it with the data. */
export function logClimb(
  data: ClimbData,
  sessionId: string,
  grade: Grade,
  tries: number,
  now: Date,
): [ClimbData, string] {
  const climb = create(pb.ClimbSchema, {
    id: newId(),
    at: timestampFromDate(now),
    grade,
    tries: Math.max(1, Math.round(tries)),
  });
  return [
    updateSession(data, sessionId, s => ({...s, climbs: [...s.climbs, climb]})),
    climb.id,
  ];
}

/** The data with the climb `id` changed by `change` (null deletes it). */
function withClimb(
  data: ClimbData,
  id: string,
  change: (c: Climb) => Climb | null,
): ClimbData {
  return {
    ...data,
    sessions: data.sessions.map(s =>
      s.climbs.some(c => c.id === id)
        ? {
            ...s,
            climbs: s.climbs.flatMap(c => {
              if (c.id !== id) return [c];
              const out = change(c);
              return out ? [out] : [];
            }),
          }
        : s,
    ),
  };
}

export function updateClimb(
  data: ClimbData,
  id: string,
  patch: Partial<Pick<Climb, 'grade' | 'tries' | 'colourId' | 'name'>>,
): ClimbData {
  return withClimb(data, id, c => ({...c, ...patch}));
}

export function deleteClimb(data: ClimbData, id: string): ClimbData {
  return withClimb(data, id, () => null);
}

/** A session's climbs, the latest logged first. */
export function climbsOf(data: ClimbData, sessionId: string): Climb[] {
  return [...(sessionById(data, sessionId)?.climbs ?? [])].reverse();
}

/** Where a climb's grade sits on `system`'s scale (converted if logged in the other); -1 if unknown. */
export function rank(climb: Climb, system: GradeSystem): number {
  return rankOf(climb.grade, system);
}

/** The hardest of `climbs` in `system`, or undefined for none. */
export function hardest(
  climbs: readonly Climb[],
  system: GradeSystem,
): string | undefined {
  let best = -1;
  for (const c of climbs) best = Math.max(best, rank(c, system));
  return best < 0 ? undefined : scale(system)[best];
}

/** A timestamp's local time of day, "18:58"; '' if unset. */
export function timeOf(t: Timestamp | undefined): string {
  return t ? hhmm(timestampDate(t)) : '';
}

/** The local date a session started on, "2026-11-21". */
export function dayOf(session: Session): string {
  return session.start ? isoDate(timestampDate(session.start)) : '';
}

/** Minutes from a session's start to its end, or to `now` while it runs. */
export function lengthOf(session: Session, now = new Date()): number {
  if (!session.start) return 0;
  const end = session.end ? timestampDate(session.end) : now;
  return Math.max(
    0,
    Math.round(
      (end.getTime() - timestampDate(session.start).getTime()) / 60_000,
    ),
  );
}

/** A length in hours and minutes: "45m", "1h 05m". */
export function formatLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** How many tries, as the list shows it: "flash", "3 tries". */
export function triesText(tries: number): string {
  return tries <= 1 ? 'flash' : `${tries} tries`;
}
