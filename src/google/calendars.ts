import { useEffect } from 'react';
import { listCalendars } from './api';
import { useGoogle } from './auth';

/** Loads the calendar list once signed in (names, colors, and which one is primary). */
export function useGoogleCalendars() {
  const status = useGoogle((s) => s.status);
  const loaded = useGoogle((s) => s.calendars.length > 0);
  useEffect(() => {
    if (status !== 'signed-in' || loaded) return;
    listCalendars()
      .then((list) => useGoogle.getState().setCalendars(list))
      .catch(() => {
        // Expiry is reported through the auth status; other errors surface in Settings on retry.
      });
  }, [status, loaded]);
}
