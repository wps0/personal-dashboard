import {describe, expect, it, vi} from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);
vi.stubGlobal('window', {addEventListener: () => {}, setTimeout: () => 0});

const {loadCalendars} = await import('./calendars');
const {useGoogle} = await import('./auth');

describe('Calendar list', () => {
  it('is dropped if the session changed while it loaded', async () => {
    let respond = () => {};
    const fetchMock = vi.fn(async () => {
      await new Promise<void>(resolve => (respond = resolve));
      return new Response(
        JSON.stringify({items: [{id: 'a@gmail.com', primary: true}]}),
        {status: 200},
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    useGoogle.setState({
      status: 'signed-in',
      token: {value: 'a', expiresAt: Date.now() + 3600_000},
      calendars: [],
    });
    const loading = loadCalendars();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    useGoogle.setState({token: {value: 'b', expiresAt: Date.now() + 3600_000}});
    respond();
    await loading;
    expect(useGoogle.getState().calendars).toEqual([]);
  });
});
