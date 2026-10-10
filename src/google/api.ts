import { useGoogle } from './auth';
import type { ApiCalendar, ApiEvent } from './events';

const BASE = 'https://www.googleapis.com/calendar/v3';

/** GET-only Calendar API client (the token is read-only anyway). */
async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token, markExpired } = useGoogle.getState();
  if (!token || token.expiresAt < Date.now()) {
    markExpired();
    throw new Error('Google session expired');
  }
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.value}` } });
  if (res.status === 401) {
    markExpired();
    throw new Error('Google session expired');
  }
  if (!res.ok) throw new Error(`Google Calendar: ${res.status} ${await res.text().catch(() => '')}`.trim());
  return res.json() as Promise<T>;
}

async function paged<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get<{ items?: T[]; nextPageToken?: string }>(path, pageToken ? { ...params, pageToken } : params);
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 10_000);
  return out;
}

export const listCalendars = () => paged<ApiCalendar>('/users/me/calendarList', { minAccessRole: 'reader', maxResults: '250' });

/** Expanded instances (recurring events become single events) between the bounds. */
export const listEvents = (calendarId: string, timeMin: string, timeMax: string) =>
  paged<ApiEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });
