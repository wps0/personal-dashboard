import {create} from 'zustand';
import type {ApiCalendar} from './events';

/**
 * Read-only by design, and the narrowest scopes that do the job (least privilege).
 * Not even calendar.readonly, which would also expose calendar settings and
 * sharing. The app cannot create, change or delete anything in Google Calendar.
 */
export const SCOPES = [
  // Read events on your calendars.
  'https://www.googleapis.com/auth/calendar.events.readonly',
  // Read which calendars you have (names, colors, which one is primary).
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

/**
 * The only Drive permission, requested only while Drive sync is on (and so
 * never by the Calendar sign-in alone): access to the files this app creates,
 * and nothing else in your Drive.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const PREFS_KEY = 'personal-dashboard/google';
const TOKEN_KEY = 'personal-dashboard/google-token';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
/** Built in by the deploy (a repository variable); one set in Settings wins. */
const BUILT_IN_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Minimal typings for Google Identity Services' token model. */
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: {prompt?: '' | 'consent' | 'select_account'}): void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
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

type Status = 'signed-out' | 'signing-in' | 'signed-in' | 'expired' | 'error';

interface Prefs {
  clientId: string;
  /** Calendars to show; empty until the list loads (then defaults to the primary one). */
  selected: string[];
  /** Consent was given before, so re-connecting can skip the consent screen. */
  consented: boolean;
  /** Drive sync is on for this device. */
  driveSync: boolean;
}

interface GoogleState extends Prefs {
  status: Status;
  error?: string;
  token?: Token;
  email?: string;
  calendars: ApiCalendar[];
  setClientId(id: string): void;
  /** Turns Drive sync on (asking Google for Drive access) or off. */
  setDriveSync(on: boolean): void;
  toggleCalendar(id: string): void;
  signIn(): Promise<void>;
  signOut(): void;
  /** Called by the API client on 401 or when the token has run out. */
  markExpired(): void;
  setCalendars(list: ApiCalendar[]): void;
}

interface Token {
  value: string;
  expiresAt: number;
  /** The scopes granted, space-separated. */
  scope?: string;
}

/** Whether the token can be used for Drive sync. */
export function hasDriveAccess(t: Token | undefined) {
  return (
    !!t &&
    t.expiresAt > Date.now() &&
    !!t.scope?.split(' ').includes(DRIVE_SCOPE)
  );
}

function loadPrefs(): Prefs {
  const fallback: Prefs = {
    clientId: BUILT_IN_CLIENT_ID,
    selected: [],
    consented: false,
    driveSync: false,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      ...fallback,
      ...stored,
      clientId: stored.clientId || BUILT_IN_CLIENT_ID,
    };
  } catch {
    return fallback;
  }
}

/** The token is kept for this tab only (sessionStorage), and only until it expires. */
function loadToken(): GoogleState['token'] {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null');
    return t && t.expiresAt > Date.now() + 60_000 ? t : undefined;
  } catch {
    return undefined;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        // Only one set in Settings, so a new built-in one still applies.
        clientId: p.clientId === BUILT_IN_CLIENT_ID ? '' : p.clientId,
        selected: p.selected,
        consented: p.consented,
        driveSync: p.driveSync,
      }),
    );
  } catch {
    // Not persisted; fine.
  }
}

let gisPromise: Promise<Gis> | null = null;

function loadGis(): Promise<Gis> {
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

const initialToken = loadToken();

export const useGoogle = create<GoogleState>()((set, get) => {
  const prefs = (patch: Partial<Prefs>) => {
    set(patch);
    savePrefs({...get(), ...patch});
  };
  return {
    ...loadPrefs(),
    status: initialToken ? 'signed-in' : 'signed-out',
    token: initialToken,
    calendars: [],

    setClientId: clientId =>
      prefs({clientId: clientId.trim() || BUILT_IN_CLIENT_ID}),

    setDriveSync: on => {
      prefs({driveSync: on});
      // Ask for Drive access unless this token already has it.
      if (on && !hasDriveAccess(get().token)) void get().signIn();
    },

    toggleCalendar: id => {
      const {selected} = get();
      prefs({
        selected: selected.includes(id)
          ? selected.filter(x => x !== id)
          : [...selected, id],
      });
    },

    signIn: async () => {
      const {clientId, consented, driveSync} = get();
      if (!clientId) {
        set({
          status: 'error',
          error: 'Add your OAuth Client ID first (Settings → Google Calendar).',
        });
        return;
      }
      set({status: 'signing-in', error: undefined});
      try {
        const gis = await loadGis();
        const wanted = driveSync ? [...SCOPES, DRIVE_SCOPE] : [...SCOPES];
        const scope = wanted.join(' ');
        const client = gis.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope,
          callback: r => {
            if (r.error || !r.access_token) {
              set({
                status: 'error',
                error: r.error_description ?? r.error ?? 'Sign-in failed',
              });
              return;
            }
            // Google's consent screen lets people untick individual permissions.
            if (!gis.accounts.oauth2.hasGrantedAllScopes(r, ...SCOPES)) {
              set({
                status: 'error',
                error:
                  'Both read permissions are needed (events and the calendar list). Sign in again and keep both ticked.',
              });
              return;
            }
            const token: Token = {
              value: r.access_token,
              expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
              scope: r.scope,
            };
            try {
              sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
            } catch {
              // Token lives in memory only.
            }
            // Drive is optional: without it the calendar still works, sync stays off.
            const noDrive =
              driveSync &&
              !gis.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE);
            set({
              token,
              status: 'signed-in',
              error: noDrive
                ? 'Drive access wasn’t allowed, so Drive sync stays off.'
                : undefined,
            });
            prefs(
              noDrive ? {consented: true, driveSync: false} : {consented: true},
            );
          },
          error_callback: e =>
            set({
              status: get().token ? 'expired' : 'signed-out',
              error:
                e.type === 'popup_closed' ? undefined : (e.message ?? e.type),
            }),
        });
        client.requestAccessToken({prompt: consented ? '' : 'consent'});
      } catch (e) {
        set({status: 'error', error: String((e as Error).message ?? e)});
      }
    },

    signOut: () => {
      const {token} = get();
      // After a reload the sign-in script isn't loaded yet: load it so the token is really revoked.
      if (token)
        void loadGis()
          .then(gis => gis.accounts.oauth2.revoke(token.value))
          .catch(() => {});
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // Nothing stored.
      }
      set({
        token: undefined,
        status: 'signed-out',
        email: undefined,
        calendars: [],
        error: undefined,
      });
      prefs({consented: false});
    },

    markExpired: () => {
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // Nothing stored.
      }
      set({token: undefined, status: 'expired'});
    },

    setCalendars: calendars => {
      const primary = calendars.find(c => c.primary);
      set({calendars, email: primary?.id});
      // First connection: show the primary calendar by default.
      if (!get().selected.length && primary) prefs({selected: [primary.id]});
    },
  };
});
