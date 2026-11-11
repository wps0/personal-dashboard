import {beforeEach, describe, expect, it, vi} from 'vitest';

const kept = new Map<string, string>();
const storage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => void kept.set(k, v),
  removeItem: (k: string) => void kept.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);
/** A fake Google Identity Services that grants what's asked. */
let requested = '';
vi.stubGlobal('window', {
  setTimeout: () => 0,
  clearTimeout: () => {},
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: {scope: string; callback(r: object): void}) => ({
          requestAccessToken: () => {
            requested = cfg.scope;
            cfg.callback({
              access_token: 'tok',
              expires_in: 3600,
              scope: cfg.scope,
            });
          },
        }),
        hasGrantedAllScopes: (r: {scope: string}, ...s: string[]) =>
          s.every(x => r.scope.split(' ').includes(x)),
        revoke: () => {},
      },
    },
  },
});

const {TASKS_SCOPE, SCOPES, tasksConnected, useGoogle} = await import('./auth');
const {useStore} = await import('../store');
const {emptyData} = await import('../model/types');
const {setUpGoogleTasks} = await import('./tasks_setting');
const {decode, encode} = await import('../storage/codec');

const inData = () => useStore.getState().data.settings.googleTasks;
const withTasks = (on: boolean) => {
  const d = emptyData();
  return {...d, settings: {...d.settings, googleTasks: on}};
};

describe('the Google Tasks setting', () => {
  beforeEach(() => {
    requested = '';
    useStore.getState().replaceAll(withTasks(true));
    useGoogle.setState({
      clientId: 'id',
      calendar: true,
      driveSync: false,
      tasks: false,
      status: 'signed-in',
      token: {
        value: 'old',
        expiresAt: Date.now() + 3_600_000,
        scope: SCOPES.join(' '),
      },
      error: undefined,
    });
  });

  // Set up once: it subscribes for good, as in the app.
  it('starts from the data, after a reload', () => {
    setUpGoogleTasks();
    expect(useGoogle.getState().tasks).toBe(true);
  });

  it('is written to the data when turned on or off', async () => {
    useStore.getState().replaceAll(withTasks(false));
    useGoogle.getState().setTasks(true);
    await vi.waitFor(() => expect(requested).toContain(TASKS_SCOPE));
    expect(inData()).toBe(true);
    expect(tasksConnected(useGoogle.getState())).toBe(true);
    useGoogle.getState().setTasks(false);
    expect(inData()).toBe(false);
  });

  it('follows the data (a sync, an import, Undo) without signing in', () => {
    useStore.getState().replaceAll(withTasks(false));
    expect(useGoogle.getState().tasks).toBe(false);
    useStore.getState().replaceAll(withTasks(true));
    expect(useGoogle.getState().tasks).toBe(true);
    // Shown, but this session's token can't read them until a sign-in.
    expect(requested).toBe('');
    expect(tasksConnected(useGoogle.getState())).toBe(false);
  });

  it('turns off in the data when their access is refused', () => {
    useStore.getState().replaceAll(withTasks(true));
    // What the sign-in does when Tasks weren't allowed.
    useGoogle.setState({tasks: false});
    expect(inData()).toBe(false);
  });

  it('is kept in what’s stored and synced; off in data saved before it', () => {
    const bytes = encode(withTasks(true));
    expect(decode(bytes).settings?.googleTasks).toBe(true);
    // The data as saved before this field: the same, without it.
    expect(decode(encode(emptyData())).settings?.googleTasks).toBe(false);
  });
});
