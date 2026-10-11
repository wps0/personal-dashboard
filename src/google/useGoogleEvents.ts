import {useEffect, useMemo} from 'react';
import {create} from 'zustand';
import type {ISODate} from '../model/types';
import {useUi} from '../ui';
import {listCalendars, listEvents} from './api';
import {clearGoogleError, reportGoogleError} from './status';
import {useGoogleCalendars} from './calendars';
import {useGoogle} from './auth';
import {expandEvent, rangeBounds, type GEvent} from './events';

const FRESH_MS = 5 * 60_000;

interface Entry {
  at: number;
  events: GEvent[];
}

/** Fetched events per visible range ("from|to"), shared by every view. */
const useCache = create<{ranges: Record<string, Entry>}>()(() => ({
  ranges: {},
}));
const inFlight = new Set<string>();

/** Drops everything (sign-in/out, calendar selection changed, manual refresh). */
export function clearGoogleCache() {
  useCache.setState({ranges: {}});
}

// Selection or account changes invalidate what we have.
useGoogle.subscribe((s, prev) => {
  if (s.selected !== prev.selected || s.token?.value !== prev.token?.value)
    clearGoogleCache();
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

async function fetchRange(from: ISODate, to: ISODate) {
  const key = `${from}|${to}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const {calendars, selected} = useGoogle.getState();
    const {timeMin, timeMax} = rangeBounds(from, to);
    const chosen = calendars.filter(c => selected.includes(c.id));
    // One failing calendar (e.g. unshared) must not hide the others.
    const results = await Promise.allSettled(
      chosen.map(async cal =>
        (await listEvents(cal.id, timeMin, timeMax)).flatMap(e =>
          expandEvent(e, cal),
        ),
      ),
    );
    const events = results
      .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
      .filter(e => e.date >= from && e.date <= to);
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
    const at = failed >= 0 ? Date.now() - FRESH_MS + 60_000 : Date.now();
    useCache.setState(s => ({ranges: {...s.ranges, [key]: {at, events}}}));
  } finally {
    inFlight.delete(key);
  }
}

/** Retry button: clears the error, reloads the calendar list if it never loaded, and refetches events. */
export function retryGoogle() {
  clearGoogleError();
  clearGoogleCache();
  if (!useGoogle.getState().calendars.length) {
    listCalendars()
      .then(list => useGoogle.getState().setCalendars(list))
      .catch(e => reportGoogleError(e));
  }
}

const EMPTY: GEvent[] = [];

/**
 * Google events for the given days, grouped by date, without calendars hidden
 * in the sidebar. Fetches (or refreshes) the range as needed. Read-only.
 */
export function useGoogleEvents(days: ISODate[]): Map<ISODate, GEvent[]> {
  useGoogleCalendars();
  const status = useGoogle(s => s.status);
  const ready = useGoogle(s => s.calendars.length > 0 && s.selected.length > 0);
  const from = days[0];
  const to = days[days.length - 1];
  const entry = useCache(s => s.ranges[`${from}|${to}`]);
  const hidden = useUi(s => s.hidden);

  useEffect(() => {
    if (
      status === 'signed-in' &&
      ready &&
      (!entry || Date.now() - entry.at > FRESH_MS)
    )
      void fetchRange(from, to);
  }, [status, ready, from, to, entry]);

  return useMemo(() => {
    const m = new Map<ISODate, GEvent[]>();
    if (status === 'signed-out' || !entry) return m;
    for (const e of entry.events) {
      if (hidden.includes(`g:${e.calendarId}`)) continue;
      const list = m.get(e.date);
      if (list) list.push(e);
      else m.set(e.date, [e]);
    }
    return m;
  }, [entry, hidden, status]);
}

export const noGoogleEvents = EMPTY;
