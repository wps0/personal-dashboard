/**
 * @fileoverview Asking a signed-out device to sign in to Google again, on
 * Home: a popup when Home opens signed out; after "Not now", a banner until
 * the device signs in. Only for a device that uses Google (Calendar or Drive
 * sync): one that never did isn't asked.
 */
import {LogIn, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {useGoogle} from '../google/auth';
import {Modal} from './modal';

/**
 * How far this signed-out spell got: the popup not answered yet, the banner,
 * or the banner closed too. Per tab (sessionStorage); signing in starts over.
 */
type Stage = 'popup' | 'banner' | 'hidden';

const KEY = 'personal-dashboard/sign-in-prompt';

function readStage(): Stage {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'banner' || v === 'hidden' ? v : 'popup';
  } catch {
    return 'popup';
  }
}

function writeStage(stage: Stage) {
  try {
    if (stage === 'popup') sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, stage);
  } catch {
    // Storage blocked: it just asks again next time.
  }
}

type GoogleState = ReturnType<typeof useGoogle.getState>;

function signedOut(g: GoogleState): boolean {
  return (
    (g.calendar || g.driveSync) &&
    g.status !== 'signed-in' &&
    g.status !== 'signing-in'
  );
}

const PAUSED = 'Your Google Calendar events and Drive sync are paused.';

/**
 * Home's sign-in prompt, where its banner goes (the popup overlays the
 * page). The popup only shows if Home opened signed out: signed out later,
 * while here (sessions last an hour), it's the banner.
 */
export function SignInPrompt() {
  const out = useGoogle(signedOut);
  const signedIn = useGoogle(s => s.status === 'signed-in');
  const [openedOut] = useState(() => signedOut(useGoogle.getState()));
  // Re-read the stage after a change to it.
  const [, changed] = useState(0);
  // Signed in: the next signed-out spell starts with the popup again.
  useEffect(() => {
    if (signedIn) writeStage('popup');
  }, [signedIn]);
  if (!out) return null;
  const stage = readStage();
  const to = (next: Stage) => {
    writeStage(next);
    changed(n => n + 1);
  };
  const signIn = () => void useGoogle.getState().signIn();

  if (stage === 'popup' && openedOut)
    return (
      <Modal
        onClose={() => to('banner')}
        width="max-w-sm"
        label="Signed out of Google"
      >
        <div className="p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <LogIn size={20} aria-hidden />
          </div>
          <h2 className="text-[16px] font-semibold text-strong">
            You're signed out of Google
          </h2>
          <p className="mt-1 text-[13px] text-dim">
            {PAUSED} Google ends a session after an hour; signing in again picks
            up where you left off.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => to('banner')}>
              Not now
            </button>
            <button
              autoFocus
              className="btn border-accent bg-accent text-on-accent"
              onClick={() => {
                // Should it not work out, the banner stays.
                to('banner');
                signIn();
              }}
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </Modal>
    );
  if (stage === 'hidden') return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px]"
    >
      <LogIn size={16} aria-hidden className="shrink-0 text-warn" />
      <span className="flex-1 text-fg">
        <span className="font-medium text-strong">Signed out of Google.</span>{' '}
        {PAUSED}
      </span>
      <button className="btn h-7" onClick={signIn}>
        Sign in
      </button>
      <button
        className="icon-btn h-7 w-7"
        aria-label="Hide until next time"
        title="Hide until next time"
        onClick={() => to('hidden')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
