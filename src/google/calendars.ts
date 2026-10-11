import {useEffect} from 'react';
import {listCalendars} from './api';
import {useGoogle} from './auth';
import {clearGoogleError, reportGoogleError} from './status';

/** Loads the calendar list once signed in (names, colors, and which one is primary). */
export function useGoogleCalendars() {
  const status = useGoogle(s => s.status);
  const loaded = useGoogle(s => s.calendars.length > 0);
  useEffect(() => {
    if (status !== 'signed-in' || loaded) return;
    listCalendars()
      .then(list => {
        clearGoogleError();
        useGoogle.getState().setCalendars(list);
      })
      .catch(e => reportGoogleError(e));
  }, [status, loaded]);
}
