import {tasksConnected, useGoogle} from '../google/auth';

/**
 * Google Tasks are on (turned on on another device, or in an imported file)
 * but this session can't read them: its token was asked for before. Signing
 * in again asks for their access; it isn't done unasked, since that opens
 * Google's popup.
 */
export function TasksSignIn() {
  const waiting = useGoogle(
    s => s.tasks && s.status === 'signed-in' && !tasksConnected(s),
  );
  if (!waiting) return null;
  return (
    <p className="px-1 text-[12px] text-dim">
      Google Tasks are on, but this session can’t read them yet.{' '}
      <button
        className="text-accent hover:underline"
        onClick={() => void useGoogle.getState().signIn()}
      >
        sign in again
      </button>{' '}
      to show them here.
    </p>
  );
}
