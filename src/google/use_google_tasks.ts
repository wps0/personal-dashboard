import {useEffect, useMemo} from 'react';
import {create} from 'zustand';
import {GOOGLE_EVENTS_FRESH_MS} from '../config';
import type {ISODate} from '../model/types';
import {useUi} from '../ui';
import {tasksConnected, useGoogle} from './auth';
import {reportGoogleError} from './status';
import {fetchTasks, type GTask} from './tasks';

/** The calendar layer (sidebar) that shows or hides Google Tasks. */
export const TASKS_LAYER = 'g-tasks';

/** Fetched tasks per visible range ("from|to"), shared by every view. */
const useCache = create<{
  ranges: Record<string, {at: number; tasks: GTask[]}>;
}>()(() => ({ranges: {}}));
const inFlight = new Set<string>();
/** Bumped by every clear, so a fetch started before it doesn't write stale data. */
let generation = 0;

/** Drops everything: tasks hidden or turned off, another sign-in, a refresh. */
export function clearGoogleTasks() {
  generation++;
  inFlight.clear();
  useCache.setState({ranges: {}});
}

useGoogle.subscribe((s, prev) => {
  const newToken = !!s.token && s.token.value !== prev.token?.value;
  if (newToken || (!s.tasks && prev.tasks) || s.status === 'signed-out')
    clearGoogleTasks();
});

async function fetchRange(from: ISODate, to: ISODate) {
  const key = `${from}|${to}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  const gen = generation;
  try {
    const tasks = await fetchTasks(from, to);
    if (gen !== generation) return;
    useCache.setState(s => ({
      ranges: {...s.ranges, [key]: {at: Date.now(), tasks}},
    }));
  } catch (e) {
    if (gen !== generation) return;
    reportGoogleError(e, 'Google Tasks');
    // Keep what was there, and try again in about a minute.
    useCache.setState(s => ({
      ranges: {
        ...s.ranges,
        [key]: {
          at: Date.now() - GOOGLE_EVENTS_FRESH_MS + 60_000,
          tasks: s.ranges[key]?.tasks ?? [],
        },
      },
    }));
  } finally {
    if (gen === generation) inFlight.delete(key);
  }
}

/**
 * Google Tasks due on the given days, grouped by date, unless hidden in the
 * sidebar. Fetches (or refreshes) the range as needed. Read-only.
 */
export function useGoogleTasks(days: ISODate[]): Map<ISODate, GTask[]> {
  const connected = useGoogle(tasksConnected);
  // While a session has expired, the tasks already loaded still show.
  const shown = useGoogle(s => s.tasks && s.status !== 'signed-out');
  const hidden = useUi(s => s.hidden.includes(TASKS_LAYER));
  const from = days[0];
  const to = days[days.length - 1];
  const entry = useCache(s => s.ranges[`${from}|${to}`]);

  useEffect(() => {
    if (
      connected &&
      !hidden &&
      (!entry || Date.now() - entry.at > GOOGLE_EVENTS_FRESH_MS)
    )
      void fetchRange(from, to);
  }, [connected, hidden, from, to, entry]);

  return useMemo(() => {
    const m = new Map<ISODate, GTask[]>();
    if (!shown || hidden || !entry) return m;
    for (const t of entry.tasks) {
      const list = m.get(t.due);
      if (list) list.push(t);
      else m.set(t.due, [t]);
    }
    // Open ones first, then by title.
    for (const list of m.values())
      list.sort(
        (a, b) =>
          Number(a.done) - Number(b.done) || a.title.localeCompare(b.title),
      );
    return m;
  }, [entry, hidden, shown]);
}
