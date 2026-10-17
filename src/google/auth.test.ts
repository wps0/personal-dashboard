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
let grant: (scope: string) => string = s => s;
vi.stubGlobal('window', {
  google: {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: {scope: string; callback(r: object): void}) => ({
          requestAccessToken: () => {
            requested = cfg.scope;
            cfg.callback({
              access_token: 'tok',
              expires_in: 3600,
              scope: grant(cfg.scope),
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

const {DRIVE_SCOPE, SCOPES, hasDriveAccess, useGoogle} = await import('./auth');

describe('Drive access in the Google sign-in', () => {
  beforeEach(() =>
    useGoogle.setState({
      clientId: 'id',
      driveSync: false,
      token: undefined,
      error: undefined,
    }),
  );

  it('is not requested while Drive sync is off', async () => {
    await useGoogle.getState().signIn();
    expect(requested.split(' ').sort()).toEqual([...SCOPES].sort());
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

  it('only counts unexpired tokens that carry the Drive scope', () => {
    const t = {value: 'x', expiresAt: Date.now() + 60_000, scope: DRIVE_SCOPE};
    expect(hasDriveAccess(t)).toBe(true);
    expect(hasDriveAccess({...t, expiresAt: Date.now() - 1})).toBe(false);
    expect(hasDriveAccess({...t, scope: undefined})).toBe(false);
    expect(hasDriveAccess(undefined)).toBe(false);
  });
});
