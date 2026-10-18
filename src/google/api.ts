import {isHexColor} from '../model/types';
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

/** Calendars you can read; a color other than "#rrggbb" is dropped (the default applies). */
export async function listCalendars() {
  const list = await paged<ApiCalendar>('/users/me/calendarList', {
    minAccessRole: 'reader',
    maxResults: '250',
  });
  return list.map(c =>
    isHexColor(c.backgroundColor) ? c : {...c, backgroundColor: undefined},
  );
}

/** Expanded instances (recurring events become single events) between the bounds. */
export function listEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
) {
  return paged<ApiEvent>(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    },
  );
}
