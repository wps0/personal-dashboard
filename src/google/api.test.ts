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

const {listCalendars, listEvents, retryPolicy} = await import('./api');
retryPolicy.baseMs = 1;
const {SCOPES, useGoogle} = await import('./auth');

const ok = (body: unknown) => new Response(JSON.stringify(body), {status: 200});

describe('Google access is read-only', () => {
  it('requests only the two narrowest read-only scopes it needs', () => {
    expect([...SCOPES].sort()).toEqual([
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ]);
    for (const s of SCOPES) expect(s).toMatch(/\.readonly$/);
    // Not the broader calendar.readonly (settings, sharing), and nothing writable.
    expect(SCOPES).not.toContain(
      'https://www.googleapis.com/auth/calendar.readonly',
    );
  });
});

describe('Calendar API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useGoogle.setState({
      status: 'signed-in',
      token: {value: 'tok', expiresAt: Date.now() + 3600_000},
    });
  });

  it('sends GET requests with the bearer token and follows pages', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({items: [{id: 'a'}], nextPageToken: 'p2'}))
      .mockResolvedValueOnce(ok({items: [{id: 'b'}]}));
    const events = await listEvents(
      'me@gmail.com',
      '2026-10-11T22:00:00.000Z',
      '2026-10-18T22:00:00.000Z',
    );
    expect(events.map(e => e.id)).toEqual(['a', 'b']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/calendars/me%40gmail.com/events?');
    expect(url).toContain('singleEvents=true');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=p2');
  });

  it('marks the session expired on 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', {status: 401}));
    await expect(listCalendars()).rejects.toThrow(/expired/);
    expect(useGoogle.getState().status).toBe('expired');
    expect(useGoogle.getState().token).toBeUndefined();
  });

  it('does not call the API with an expired token', async () => {
    useGoogle.setState({token: {value: 'old', expiresAt: Date.now() - 1}});
    await expect(listCalendars()).rejects.toThrow(/expired/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries rate limits and server errors with backoff, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({error: {errors: [{reason: 'rateLimitExceeded'}]}}),
          {status: 403},
        ),
      )
      .mockResolvedValueOnce(new Response('', {status: 503}))
      .mockResolvedValueOnce(ok({items: [{id: 'cal'}]}));
    expect((await listCalendars()).map(c => c.id)).toEqual(['cal']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt', async () => {
    fetchMock.mockResolvedValue(new Response('', {status: 429}));
    await expect(listCalendars()).rejects.toMatchObject({kind: 'rate-limit'});
    expect(fetchMock).toHaveBeenCalledTimes(retryPolicy.attempts);
  });

  it('does not retry errors that will not fix themselves', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({error: {errors: [{reason: 'accessNotConfigured'}]}}),
        {status: 403},
      ),
    );
    await expect(listCalendars()).rejects.toMatchObject({kind: 'api-disabled'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports network failures as offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(listCalendars()).rejects.toMatchObject({kind: 'offline'});
  });

  it('defaults to the primary calendar on first connection', () => {
    useGoogle.setState({selected: []});
    useGoogle.getState().setCalendars([
      {id: 'holidays', summary: 'Holidays'},
      {id: 'me@gmail.com', summary: 'Me', primary: true},
    ]);
    expect(useGoogle.getState().selected).toEqual(['me@gmail.com']);
    expect(useGoogle.getState().email).toBe('me@gmail.com');
  });
});
