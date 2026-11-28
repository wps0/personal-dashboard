/**
 * @fileoverview Google Identity Services (sign-in), loaded on demand, for
 * both apps: the dashboard (auth.ts) and the climbing log, which signs in on
 * its own for Drive only. The OAuth Client ID is set once, in the
 * dashboard's Settings, and shared.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
/** Built in by the deploy (a repository variable); one set in Settings wins. */
export const BUILT_IN_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Minimal typings for Google Identity Services' token model. */
export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: {prompt?: '' | 'consent' | 'select_account'}): void;
}
export interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        include_granted_scopes?: boolean;
        callback(r: TokenResponse): void;
        error_callback?(e: {type: string; message?: string}): void;
      }): TokenClient;
      hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
      revoke(token: string, done?: () => void): void;
    };
  };
}
declare global {
  interface Window {
    google?: Gis;
  }
}

let gisPromise: Promise<Gis> | null = null;

export function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  gisPromise ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () =>
      window.google?.accounts?.oauth2
        ? resolve(window.google)
        : reject(new Error('Google sign-in failed to initialise'));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in (offline or blocked?)'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Drive access to the files the app made, and no others: both apps' sync. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Where the dashboard keeps its Google preferences, the Client ID among them. */
export const GOOGLE_PREFS_KEY = 'personal-dashboard/google';

/** The OAuth Client ID: the one set in the dashboard's Settings, else the built-in one. */
export function sharedClientId(): string {
  try {
    const p = JSON.parse(localStorage.getItem(GOOGLE_PREFS_KEY) ?? '{}');
    if (typeof p.clientId === 'string' && p.clientId) return p.clientId;
  } catch {
    // Unreadable: the built-in one.
  }
  return BUILT_IN_CLIENT_ID;
}
