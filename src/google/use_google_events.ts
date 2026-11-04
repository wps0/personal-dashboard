import {GOOGLE_EVENTS_FRESH_MS} from '../config';
import {useEffect, useMemo} from 'react';
import {create} from 'zustand';
import type {ISODate} from '../model/types';
import {useUi} from '../ui';
import {listEvents} from './api';
import {clearGoogleError, reportGoogleError} from './status';
import {loadCalendars, useGoogleCalendars} from './calendars';
import {calendarConnected, useGoogle} from './auth';
import {expandEvent, rangeBounds, type GEvent} from './events';

interface Entry {
  at: number;
  events: GEvent[];
}

/** Fetched events per visible range ("from|to"), shared by every view. */
const useCache = create<{ranges: Record<string, Entry>}>()(() => ({
  ranges: {},
}));
const inFlight = new Set<string>();
/** Bumped by every clear, so a fetch started before it doesn't write stale data. */
let generation = 0;

/** Drops everything (sign-in/out, calendar selection changed, manual refresh). */
export function clearGoogleCache() {
  generation++;
  inFlight.clear();
  useCache.setState({ranges: {}});
}

// Selection or account changes invalidate what we have. Expiry doesn't: what
// was loaded still shows until a new token arrives.
useGoogle.subscribe((s, prev) => {
  const newToken = !!s.token && s.token.value !== prev.token?.value;
  const ended =
    (s.status === 'signed-out' && prev.status !== 'signed-out') ||
    (!s.calendar && prev.calendar);
  if (s.selected !== prev.selected || newToken || ended) clearGoogleCache();
});

// Coming back to the tab: refetch anything older than a minute.
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const now = Date.now();
    const ranges = useCache.getState().ranges;
    const stale = Object.entries(ranges).filter(([, e]) => now - e.at > 60_000);
    if (stale.length)
      useCache.setState({
        ranges: {
          ...ranges,
          ...Object.fromEntries(stale.map(([k, e]) => [k, {...e, at: 0}])),
        },
      });
  });
}

/** For tests. */
export function cachedRanges() {
  return useCache.getState().ranges;
}

/** Fetches the range's events from the selected calendars into the cache. */
export async function fetchRange(from: ISODate, to: ISODate) {
  const key = `${from}|${to}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  const gen = generation;
  try {
    const {calendars, selected} = useGoogle.getState();
    const {timeMin, timeMax} = rangeBounds(from, to);
    const chosen = calendars.filter(c => selected.includes(c.id));
    // One failing calendar (e.g. unshared) must not hide the others.
    const results = await Promise.allSettled(
      chosen.map(async cal =>
        (await listEvents(cal.id, timeMin, timeMax)).flatMap(e =>
          expandEvent(e, cal, {from, to}),
        ),
      ),
    );
    // Cleared meanwhile (e.g. another selection): a newer fetch takes over.
    if (gen !== generation) return;
    // A calendar that failed this time (offline, rate limit) keeps what it had.
    const before = useCache.getState().ranges[key]?.events ?? [];
    const events = results.flatMap((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : before.filter(e => e.calendarId === chosen[i].id),
    );
    const failed = results.findIndex(r => r.status === 'rejected');
    if (failed >= 0)
      reportGoogleError(
        (results[failed] as PromiseRejectedResult).reason,
        chosen.length > 1
          ? (chosen[failed].summaryOverride ?? chosen[failed].summary)
          : undefined,
      );
    else clearGoogleError();
    // After a failure, try again in about a minute instead of waiting the full 5.
    const at =
      failed >= 0 ? Date.now() - GOOGLE_EVENTS_FRESH_MS + 60_000 : Date.now();
    useCache.setState(s => ({ranges: {...s.ranges, [key]: {at, events}}}));
  } finally {
    if (gen === generation) inFlight.delete(key);
  }
}

/** Retry button: clears the error, reloads the calendar list if it never loaded, and refetches events. */
export function retryGoogle() {
  clearGoogleError();
  clearGoogleCache();
  if (!useGoogle.getState().calendars.length) void loadCalendars();
}

const EMPTY: GEvent[] = [];

/**
 * Google events for the given days, grouped by date, without calendars hidden
 * in the sidebar. Fetches (or refreshes) the range as needed. Read-only.
 */
export function useGoogleEvents(days: ISODate[]): Map<ISODate, GEvent[]> {
  useGoogleCalendars();
  const connected = useGoogle(calendarConnected);
  // While a session has expired, the events already loaded still show.
  const shown = useGoogle(s => s.calendar && s.status !== 'signed-out');
  const ready = useGoogle(s => s.calendars.length > 0 && s.selected.length > 0);
  const from = days[0];
  const to = days[days.length - 1];
  const entry = useCache(s => s.ranges[`${from}|${to}`]);
  const hidden = useUi(s => s.hidden);

  useEffect(() => {
    if (
      connected &&
      ready &&
      (!entry || Date.now() - entry.at > GOOGLE_EVENTS_FRESH_MS)
    )
      void fetchRange(from, to);
  }, [connected, ready, from, to, entry]);

  return useMemo(() => {
    const m = new Map<ISODate, GEvent[]>();
    if (!shown || !entry) return m;
    for (const e of entry.events) {
      if (hidden.includes(`g:${e.calendarId}`)) continue;
      const list = m.get(e.date);
      if (list) list.push(e);
      else m.set(e.date, [e]);
    }
    return m;
  }, [entry, hidden, shown]);
}

export const noGoogleEvents = EMPTY;
