// PROTOTYPE ONLY (not for merging): ways to ask a signed-out device to sign
// in to Google again, picked with ?signin=banner|chip|popup|corner.
import {LogIn, X} from 'lucide-react';
import {useState} from 'react';
import {useGoogle} from '../google/auth';

export const SIGNIN_VARIANT =
  new URLSearchParams(location.search).get('signin') ?? '';

/** This device uses Google (Calendar or Drive sync) but has no session now. */
export function useSignedOut(): boolean {
  return useGoogle(
    s =>
      (s.calendar || s.driveSync) &&
      s.status !== 'signed-in' &&
      s.status !== 'signing-in',
  );
}

function signIn() {
  void useGoogle.getState().signIn();
}

const WHY = 'Your Google Calendar events and Drive sync are paused.';

export function SignInBanner() {
  const out = useSignedOut();
  const [gone, setGone] = useState(false);
  if (SIGNIN_VARIANT !== 'banner' || !out || gone) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px]">
      <LogIn size={16} className="shrink-0 text-warn" />
      <span className="flex-1 text-fg">
        <span className="font-medium text-strong">Signed out of Google.</span>{' '}
        {WHY}
      </span>
      <button className="btn h-7" onClick={signIn}>
        Sign in
      </button>
      <button
        className="icon-btn h-7 w-7"
        aria-label="Not now"
        onClick={() => setGone(true)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function SignInChip() {
  const out = useSignedOut();
  if (SIGNIN_VARIANT !== 'chip' || !out) return null;
  return (
    <button
      className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-warn/50 bg-warn/10 px-3 text-[12px] text-strong hover:bg-warn/20"
      onClick={signIn}
      title={`Signed out of Google. ${WHY}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      Sign in to Google
    </button>
  );
}

export function SignInPopup() {
  const out = useSignedOut();
  const [gone, setGone] = useState(false);
  if (SIGNIN_VARIANT !== 'popup' || !out || gone) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-label="Signed out of Google"
        className="w-full max-w-sm animate-pop-in rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
          <LogIn size={20} />
        </div>
        <h2 className="text-[16px] font-semibold text-strong">
          You're signed out of Google
        </h2>
        <p className="mt-1 text-[13px] text-dim">
          {WHY} Google ends a session after an hour; signing in again picks up
          where you left off.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setGone(true)}>
            Not now
          </button>
          <button
            className="btn border-accent bg-accent text-on-accent"
            onClick={signIn}
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

export function SignInCorner() {
  const out = useSignedOut();
  const [gone, setGone] = useState(false);
  if (SIGNIN_VARIANT !== 'corner' || !out || gone) return null;
  return (
    <div className="fixed right-4 bottom-4 z-[60] w-72 animate-toast-in rounded-xl border border-line bg-panel p-3 shadow-2xl">
      <div className="flex items-start gap-2">
        <LogIn size={16} className="mt-0.5 shrink-0 text-accent" />
        <div className="flex-1">
          <div className="text-[13px] font-medium text-strong">
            Signed out of Google
          </div>
          <p className="mt-0.5 text-[12px] text-dim">{WHY}</p>
        </div>
        <button
          className="icon-btn h-6 w-6"
          aria-label="Not now"
          onClick={() => setGone(true)}
        >
          <X size={13} />
        </button>
      </div>
      <button className="btn mt-2 w-full justify-center" onClick={signIn}>
        Sign in
      </button>
    </div>
  );
}
