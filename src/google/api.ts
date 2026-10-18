import type {ApiCalendar, ApiEvent} from './events';
import {googleFetch} from './request';

const BASE = 'https://www.googleapis.com/calendar/v3';

/** GET-only Calendar API client (the token is read-only anyway). */
async function get<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  return (await googleFetch('calendar', url)).json() as Promise<T>;
}

async function paged<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get<{items?: T[]; nextPageToken?: string}>(
      path,
      pageToken ? {...params, pageToken} : params,
    );
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 10_000);
  return out;
}

export const listCalendars = () =>
  paged<ApiCalendar>('/users/me/calendarList', {
    minAccessRole: 'reader',
    maxResults: '250',
  });

/** Expanded instances (recurring events become single events) between the bounds. */
export const listEvents = (
  calendarId: string,
  timeMin: string,
  timeMax: string,
) =>
  paged<ApiEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });
