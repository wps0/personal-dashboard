import {beforeEach, describe, expect, it, vi} from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);
vi.stubGlobal('window', {addEventListener: () => {}, setTimeout: () => 0});

const {cachedRanges, clearGoogleCache, fetchRange} =
  await import('./use_google_events');
const {retryPolicy} = await import('./request');
retryPolicy.baseMs = 1;
const {useGoogle} = await import('./auth');
const {useGoogleError} = await import('./status');

const FROM = '2026-10-12';
const TO = '2026-10-18';

/** A calendar's events: one at 10:00 on 14 Oct, titled after the calendar. */
function events(calendarId: string) {
  return new Response(
    JSON.stringify({
      items: [
        {
          id: `${calendarId}-1`,
          summary: calendarId,
          start: {dateTime: '2026-10-14T10:00:00+02:00'},
          end: {dateTime: '2026-10-14T11:00:00+02:00'},
        },
      ],
    }),
    {status: 200},
  );
}

function calendarOf(url: string) {
  return decodeURIComponent(url.split('/calendars/')[1].split('/')[0]);
}

describe('Google events cache', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useGoogle.setState({
      status: 'signed-in',
      calendar: true,
      token: {value: 'tok', expiresAt: Date.now() + 3600_000},
      calendars: [
        {id: 'a', summary: 'A'},
        {id: 'b', summary: 'B'},
      ],
      selected: ['a', 'b'],
    });
    useGoogleError.setState({error: undefined});
    clearGoogleCache();
  });

  it('keeps the events of calendars that fail to refresh', async () => {
    fetchMock.mockImplementation(async url => events(calendarOf(String(url))));
    await fetchRange(FROM, TO);
    expect(cachedRanges()[`${FROM}|${TO}`].events).toHaveLength(2);

    fetchMock.mockImplementation(async () => new Response('', {status: 503}));
    await fetchRange(FROM, TO);
    const titles = cachedRanges()[`${FROM}|${TO}`].events.map(e => e.title);
    expect(titles.sort()).toEqual(['a', 'b']);
    expect(useGoogleError.getState().error).toBeDefined();
  });

  it('keeps what was loaded while the session is expired, not after signing out', async () => {
    fetchMock.mockImplementation(async url => events(calendarOf(String(url))));
    await fetchRange(FROM, TO);
    useGoogle.getState().markExpired();
    expect(cachedRanges()[`${FROM}|${TO}`].events).toHaveLength(2);
    useGoogle.getState().signOut();
    expect(cachedRanges()).toEqual({});
  });

  it('drops what was loaded when a new token arrives', async () => {
    fetchMock.mockImplementation(async url => events(calendarOf(String(url))));
    await fetchRange(FROM, TO);
    useGoogle.setState({token: {value: 'new', expiresAt: Date.now() + 1}});
    expect(cachedRanges()).toEqual({});
  });
});
