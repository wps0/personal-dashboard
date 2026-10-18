import {useEffect} from 'react';
import {listCalendars} from './api';
import {calendarConnected, useGoogle} from './auth';
import {clearGoogleError, reportGoogleError} from './status';

/** Loads the calendar list, dropping it if the session changed meanwhile. */
export async function loadCalendars() {
  const used = useGoogle.getState().token?.value;
  try {
    const list = await listCalendars();
    if (useGoogle.getState().token?.value !== used) return;
    clearGoogleError();
    useGoogle.getState().setCalendars(list);
  } catch (e) {
    reportGoogleError(e);
  }
}

/** Loads the calendar list once signed in (names, colors, and which one is primary). */
export function useGoogleCalendars() {
  const connected = useGoogle(calendarConnected);
  const loaded = useGoogle(s => s.calendars.length > 0);
  useEffect(() => {
    if (!connected || loaded) return;
    void loadCalendars();
  }, [connected, loaded]);
}
