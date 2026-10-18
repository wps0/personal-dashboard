import {beforeEach, describe, expect, it, vi} from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);

/** A fake Google Identity Services that grants what `grant` lists. */
let requested = '';
let revoked = 0;
let includeGranted: boolean | undefined;
let grant: (scope: string) => string = s => s;
/** Set to make the next sign-in fail this way instead of granting. */
let fail: 'popup_closed' | 'access_denied' | undefined;
vi.stubGlobal('window', {
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: {
          scope: string;
          include_granted_scopes?: boolean;
          callback(r: object): void;
          error_callback?(e: {type: string}): void;
        }) => ({
          requestAccessToken: () => {
            requested = cfg.scope;
            includeGranted = cfg.include_granted_scopes;
            if (fail === 'popup_closed')
              return cfg.error_callback?.({type: fail});
            if (fail) return cfg.callback({error: fail});
            cfg.callback({
              access_token: 'tok',
              expires_in: 3600,
              scope: grant(cfg.scope),
            });
          },
        }),
        hasGrantedAllScopes: (r: {scope: string}, ...s: string[]) =>
          s.every(x => r.scope.split(' ').includes(x)),
        revoke: () => void revoked++,
      },
    },
  },
});

const {DRIVE_SCOPE, SCOPES, hasDriveAccess, useGoogle} = await import('./auth');

describe('Drive access in the Google sign-in', () => {
  beforeEach(() => {
    requested = '';
    useGoogle.setState({
      clientId: 'id',
      driveSync: false,
      calendar: true,
      status: 'signed-out',
      token: undefined,
      error: undefined,
    });
  });

  it('is not requested while Drive sync is off', async () => {
    await useGoogle.getState().signIn();
    expect(requested.split(' ').sort()).toEqual([...SCOPES].sort());
    // Nor carried over from an earlier grant.
    expect(includeGranted).toBe(false);
    expect(hasDriveAccess(useGoogle.getState().token)).toBe(false);
  });

  it('is requested when sync is turned on', async () => {
    await useGoogle.getState().signIn();
    useGoogle.getState().setDriveSync(true);
    await vi.waitFor(() => expect(requested).toContain(DRIVE_SCOPE));
    expect(hasDriveAccess(useGoogle.getState().token)).toBe(true);
    expect(useGoogle.getState().driveSync).toBe(true);
  });

  it('turns sync off, keeping the calendar, if Drive access is refused', async () => {
    grant = s => s.replace(DRIVE_SCOPE, '').trim();
    useGoogle.getState().setDriveSync(true);
    await vi.waitFor(() =>
      expect(useGoogle.getState().status).toBe('signed-in'),
    );
    expect(useGoogle.getState().driveSync).toBe(false);
    expect(useGoogle.getState().error).toMatch(/Drive access wasn’t allowed/);
    expect(hasDriveAccess(useGoogle.getState().token)).toBe(false);
    grant = s => s;
  });

  it('asks for Drive alone when the calendar is off', async () => {
    useGoogle.setState({calendar: false});
    await useGoogle.getState().signIn();
    expect(requested).toBe('');
    useGoogle.getState().setDriveSync(true);
    await vi.waitFor(() => expect(requested).toBe(DRIVE_SCOPE));
    expect(useGoogle.getState().status).toBe('signed-in');
  });

  it('connects the calendar on demand, and swaps in a Drive-only token when it’s disconnected', async () => {
    useGoogle.setState({calendar: false, driveSync: true});
    await useGoogle.getState().connectCalendar();
    expect(requested.split(' ').sort()).toEqual(
      [...SCOPES, DRIVE_SCOPE].sort(),
    );
    expect(useGoogle.getState().calendar).toBe(true);

    useGoogle.getState().disconnectCalendar();
    await vi.waitFor(() => expect(requested).toBe(DRIVE_SCOPE));
    expect(useGoogle.getState().calendar).toBe(false);
    expect(hasDriveAccess(useGoogle.getState().token)).toBe(true);
  });

  it('gives access back when neither the calendar nor sync is on', async () => {
    useGoogle.setState({calendar: false});
    useGoogle.getState().setDriveSync(true);
    await vi.waitFor(() =>
      expect(useGoogle.getState().status).toBe('signed-in'),
    );
    const before = revoked;
    useGoogle.getState().setDriveSync(false);
    expect(useGoogle.getState().status).toBe('signed-out');
    await vi.waitFor(() => expect(revoked).toBe(before + 1));
  });

  it('keeps sync working if the calendar permissions are refused', async () => {
    grant = s =>
      s
        .split(' ')
        .filter(x => x === DRIVE_SCOPE)
        .join(' ');
    useGoogle.setState({driveSync: true});
    await useGoogle.getState().signIn();
    expect(useGoogle.getState().status).toBe('signed-in');
    expect(useGoogle.getState().calendar).toBe(false);
    expect(useGoogle.getState().error).toMatch(/calendar stays off/);
    expect(hasDriveAccess(useGoogle.getState().token)).toBe(true);
    grant = s => s;
  });

  it('keeps the session, and turns sync back off, when the popup is closed', async () => {
    await useGoogle.getState().signIn();
    fail = 'popup_closed';
    useGoogle.getState().setDriveSync(true);
    await vi.waitFor(() => expect(requested).toContain(DRIVE_SCOPE));
    fail = undefined;
    const s = useGoogle.getState();
    expect(s.status).toBe('signed-in');
    expect(s.calendar).toBe(true);
    expect(s.driveSync).toBe(false);
    expect(s.token?.value).toBe('tok');
  });

  it('keeps the session, with the error, when access is denied', async () => {
    await useGoogle.getState().signIn();
    fail = 'access_denied';
    useGoogle.getState().setDriveSync(true);
    await vi.waitFor(() => expect(requested).toContain(DRIVE_SCOPE));
    fail = undefined;
    const s = useGoogle.getState();
    expect(s.status).toBe('signed-in');
    expect(s.error).toBe('access_denied');
    expect(s.calendar).toBe(true);
    expect(s.driveSync).toBe(false);
  });

  it('only counts unexpired tokens that carry the Drive scope', () => {
    const t = {value: 'x', expiresAt: Date.now() + 60_000, scope: DRIVE_SCOPE};
    expect(hasDriveAccess(t)).toBe(true);
    expect(hasDriveAccess({...t, expiresAt: Date.now() - 1})).toBe(false);
    expect(hasDriveAccess({...t, scope: undefined})).toBe(false);
    expect(hasDriveAccess(undefined)).toBe(false);
  });
});

describe('Calendar preference', () => {
  it('stays on for people who connected the calendar before it existed', async () => {
    const key = 'personal-dashboard/google';
    const fresh = async (prefs: object) => {
      store.set(key, JSON.stringify(prefs));
      vi.resetModules();
      return (await import('./auth')).useGoogle.getState().calendar;
    };
    expect(await fresh({clientId: 'id', consented: true})).toBe(true);
    expect(await fresh({clientId: 'id'})).toBe(false);
    expect(await fresh({consented: true, calendar: false})).toBe(false);
    store.delete(key);
  });
});
