import {useGoogle} from './auth';
import {classify, GoogleApiError, isRetryable} from './errors';
import type {ApiCalendar, ApiEvent} from './events';

const BASE = 'https://www.googleapis.com/calendar/v3';

/** Retry policy for rate limits and server errors (exponential backoff with jitter). Tests shorten it. */
export const retryPolicy = {attempts: 3, baseMs: 800};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** GET-only Calendar API client (the token is read-only anyway). */
async function get<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getOnce<T>(path, params);
    } catch (e) {
      if (!isRetryable(e) || attempt + 1 >= retryPolicy.attempts) throw e;
      await sleep(
        retryPolicy.baseMs * 2 ** attempt * (1 + Math.random() * 0.3),
      );
    }
  }
}

async function getOnce<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const {token, markExpired} = useGoogle.getState();
  if (!token || token.expiresAt < Date.now()) {
    markExpired();
    throw new GoogleApiError('expired', 'Google session expired');
  }
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, {headers: {Authorization: `Bearer ${token.value}`}});
  } catch {
    throw new GoogleApiError('offline', 'Can’t reach Google. Are you offline?');
  }
  if (res.status === 401) {
    markExpired();
    throw new GoogleApiError('expired', 'Google session expired', 401);
  }
  if (!res.ok) throw classify(res.status, await res.json().catch(() => null));
  return res.json() as Promise<T>;
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
