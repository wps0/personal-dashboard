/**
 * @fileoverview The climbing log's own Google sign-in, for Drive sync only
 * (the drive.file scope: the files the log made, and nothing else). The
 * OAuth Client ID is the one set in the dashboard's Settings; the token is
 * the log's, kept in this tab like the dashboard's.
 */

import {create} from 'zustand';
import {googleFetchWith, type TokenSource} from '../google/fetch_with';
import {DRIVE_SCOPE, loadGis, sharedClientId} from '../google/gis';

const TOKEN_KEY = 'climb/google-token';
const SYNC_KEY = 'climb/drive-sync';

interface Token {
  value: string;
  expiresAt: number;
}

interface DriveState {
  /** Sync is on on this device. */
  on: boolean;
  token?: Token;
  signingIn: boolean;
  error?: string;
}

function load<T>(storage: Storage, key: string): T | undefined {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

export const useDrive = create<DriveState>()(() => ({
  on: load<boolean>(localStorage, SYNC_KEY) ?? false,
  token: load<Token>(sessionStorage, TOKEN_KEY),
  signingIn: false,
}));

function setToken(token: Token | undefined) {
  useDrive.setState({token});
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Not kept; signing in again works.
  }
}

/** Whether there's a token that hasn't run out. */
export function hasToken(): boolean {
  const {token} = useDrive.getState();
  return !!token && token.expiresAt > Date.now();
}

/** The log's token, for its Drive requests. */
const TOKENS: TokenSource = {
  current: () => useDrive.getState().token,
  expire: used => {
    if (useDrive.getState().token?.value === used) setToken(undefined);
  },
};

export function climbFetch(service: 'drive', url: string, init?: RequestInit) {
  return googleFetchWith(TOKENS, service, url, init);
}

/** Signs in with Google for Drive access (a popup; Google may skip it once allowed). */
export async function signIn() {
  const clientId = sharedClientId();
  if (!clientId) {
    useDrive.setState({
      error:
        'Add your Google OAuth Client ID in the dashboard’s Settings first: the log uses the same one.',
    });
    return;
  }
  useDrive.setState({signingIn: true, error: undefined});
  try {
    const gis = await loadGis();
    gis.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        include_granted_scopes: false,
        callback: r => {
          const ok =
            r.access_token &&
            gis.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE);
          if (ok)
            setToken({
              value: r.access_token!,
              expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000,
            });
          useDrive.setState({
            signingIn: false,
            error: ok
              ? undefined
              : (r.error_description ??
                'Drive access wasn’t allowed, so sync can’t run.'),
          });
        },
        error_callback: e =>
          useDrive.setState({
            signingIn: false,
            error:
              e.type === 'popup_closed'
                ? 'Sign-in was closed before it finished.'
                : (e.message ?? 'Sign-in failed.'),
          }),
      })
      .requestAccessToken({prompt: ''});
  } catch (e) {
    useDrive.setState({
      signingIn: false,
      error: String((e as Error).message ?? e),
    });
  }
}

/** Turns Drive sync on (signing in) or off on this device. */
export function setSyncOn(on: boolean) {
  useDrive.setState({on, error: undefined});
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(on));
  } catch {
    // Storage blocked: the switch lasts until the page reloads.
  }
  if (on && !hasToken()) void signIn();
  if (!on) setToken(undefined);
}
