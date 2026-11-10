/**
 * @fileoverview Asking a signed-out device to sign in to Google again: a
 * popup on whatever page is open when the signed-out spell starts (opening
 * the app signed out, or a session ending), then, after "Not now", a banner
 * on Home until the device signs in. Only for a device that uses Google
 * (Calendar or Drive sync): one that never did isn't asked.
 */
import {LogIn, X} from 'lucide-react';
import {useEffect} from 'react';
import {create} from 'zustand';
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

const useStage = create<{stage: Stage; to(stage: Stage): void}>(set => ({
  stage: readStage(),
  to: stage => {
    try {
      if (stage === 'popup') sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, stage);
    } catch {
      // Storage blocked: it just asks again next time.
    }
    set({stage});
  },
}));

type GoogleState = ReturnType<typeof useGoogle.getState>;

function signedOut(g: GoogleState): boolean {
  return (
    (g.calendar || g.driveSync || g.tasks) &&
    g.status !== 'signed-in' &&
    g.status !== 'signing-in'
  );
}

const PAUSED = 'Your Google Calendar events and Drive sync are paused.';

function signIn() {
  void useGoogle.getState().signIn();
}

/**
 * The popup, on every page (it's in the app's frame): when the app opens
 * signed out, and when a session ends while it's open (they last an hour).
 */
export function SignInPopup() {
  const out = useGoogle(signedOut);
  const signedIn = useGoogle(s => s.status === 'signed-in');
  const stage = useStage(s => s.stage);
  // Signed in: the next signed-out spell starts with the popup again.
  useEffect(() => {
    if (signedIn) useStage.getState().to('popup');
  }, [signedIn]);
  if (!out || stage !== 'popup') return null;
  const to = useStage.getState().to;
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
}

/** Home's banner, after the popup's "Not now", until the device signs in. */
export function SignInBanner() {
  const out = useGoogle(signedOut);
  const stage = useStage(s => s.stage);
  if (!out || stage !== 'banner') return null;
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
        onClick={() => useStage.getState().to('hidden')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
