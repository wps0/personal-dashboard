import {useEffect} from 'react';
import {listCalendars} from './api';
import {calendarConnected, useGoogle} from './auth';
import {clearGoogleError, reportGoogleError} from './status';

/** Loads the calendar list once signed in (names, colors, and which one is primary). */
export function useGoogleCalendars() {
  const connected = useGoogle(calendarConnected);
  const loaded = useGoogle(s => s.calendars.length > 0);
  useEffect(() => {
    if (!connected || loaded) return;
    listCalendars()
      .then(list => {
        clearGoogleError();
        useGoogle.getState().setCalendars(list);
      })
      .catch(e => reportGoogleError(e));
  }, [connected, loaded]);
}
