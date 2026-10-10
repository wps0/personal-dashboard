import { Lock, LogOut, RefreshCw } from 'lucide-react';
import { useGoogle, SCOPES } from '../google/auth';
import { useGoogleCalendars } from '../google/calendars';
import { clearGoogleCache } from '../google/useGoogleEvents';
import { BufferedInput } from './Buffered';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

/** Settings → Google Calendar: client ID, sign-in, and which calendars to show. Read-only access only. */
export function GoogleSettings() {
  useGoogleCalendars();
  const g = useGoogle();
  const connected = g.status === 'signed-in';

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px] text-dim">
        <Lock size={14} className="mt-px shrink-0" />
        <span>
          Read-only. The app asks only for{' '}
          {SCOPES.map((s, i) => (
            <span key={s}>
              {i > 0 && ' and '}
              <code className="text-fg">{s.split('/').pop()}</code>
            </span>
          ))}
          , so it can show your events but never
          create, change or delete anything. The access token stays in this browser tab and expires after an hour.
        </span>
      </p>

      <label className="flex items-center gap-3">
        <span className="w-48 shrink-0">OAuth Client ID</span>
        <BufferedInput
          value={g.clientId}
          placeholder="1234567890-abc….apps.googleusercontent.com"
          onCommit={(v) => g.setClientId(v)}
          className="field h-8 min-w-0 flex-1 tabular-nums"
          spellCheck={false}
        />
      </label>
      {!g.clientId && (
        <details className="rounded-md border border-line px-3 py-2 text-[12px] text-dim">
          <summary className="cursor-pointer text-fg">How to get a Client ID (5 minutes, free)</summary>
          <ol className="mt-2 ml-4 list-decimal space-y-1">
            <li>
              In the Google Cloud console, create a project and enable the <b>Google Calendar API</b>.
            </li>
            <li>
              OAuth consent screen: <b>External</b>, testing mode; add yourself as a test user; add the scopes <code>calendar.events.readonly</code> and <code>calendar.calendarlist.readonly</code>.
            </li>
            <li>
              Credentials → Create credentials → <b>OAuth client ID</b> → Web application. Authorized JavaScript origins: <code>{ORIGIN}</code> (and
              any other address you use, e.g. your GitHub Pages URL). No redirect URI is needed.
            </li>
            <li>Paste the Client ID above. It isn't a secret.</li>
          </ol>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <span className="text-[13px]">
              Connected{g.email ? <> as <b className="text-strong">{g.email}</b></> : ''}
            </span>
            <button className="btn" onClick={() => (clearGoogleCache(), useGoogle.setState({ calendars: [] }))} title="Reload calendars and events">
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="btn" onClick={g.signOut}>
              <LogOut size={13} /> Sign out
            </button>
          </>
        ) : (
          <button className="btn-primary" disabled={!g.clientId || g.status === 'signing-in'} onClick={() => void g.signIn()}>
            {g.status === 'signing-in' ? 'Waiting for Google…' : g.status === 'expired' ? 'Reconnect Google Calendar' : 'Sign in with Google'}
          </button>
        )}
        {g.status === 'expired' && <span className="text-[12px] text-warn">Session expired (tokens last an hour).</span>}
        {g.error && <span className="text-[12px] text-danger">{g.error}</span>}
      </div>

      {connected && g.calendars.length > 0 && (
        <div>
          <div className="label mb-1">Calendars to show</div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {g.calendars.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-raised">
                  <input type="checkbox" checked={g.selected.includes(c.id)} onChange={() => g.toggleCalendar(c.id)} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.backgroundColor }} />
                  <span className="truncate">{c.summaryOverride ?? c.summary}</span>
                  {c.primary && <span className="text-[11px] text-dim">primary</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
