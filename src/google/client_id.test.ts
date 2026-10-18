import {beforeEach, describe, expect, it, vi} from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);

const BUILT_IN = 'built-in.apps.googleusercontent.com';

/** The auth module as a fresh page load would get it. */
async function load() {
  vi.resetModules();
  return (await import('./auth')).useGoogle;
}

describe('OAuth client ID', () => {
  beforeEach(() => {
    store.clear();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', BUILT_IN);
  });

  it('defaults to the built-in one, without saving it as a choice', async () => {
    const google = await load();
    expect(google.getState().clientId).toBe(BUILT_IN);
    google.getState().toggleCalendar('primary');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'newer.apps.googleusercontent.com');
    expect((await load()).getState().clientId).toBe(
      'newer.apps.googleusercontent.com',
    );
  });

  it('prefers one set in Settings, and goes back to the built-in one when cleared', async () => {
    let google = await load();
    google.getState().setClientId(' mine.apps.googleusercontent.com ');
    google = await load();
    expect(google.getState().clientId).toBe('mine.apps.googleusercontent.com');
    google.getState().setClientId('');
    expect(google.getState().clientId).toBe(BUILT_IN);
    expect((await load()).getState().clientId).toBe(BUILT_IN);
  });
});
