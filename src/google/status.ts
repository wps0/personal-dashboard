import { create } from 'zustand';
import { toast } from '../toast';
import { GoogleApiError } from './errors';

export interface GoogleErrorInfo {
  message: string;
  help?: string;
}

/** The latest problem talking to Google, shown in Settings and the calendar sidebar. */
export const useGoogleError = create<{ error?: GoogleErrorInfo }>(() => ({}));

/**
 * Records an error for display. A toast appears only when the message is new,
 * so a failing refresh doesn't toast every few minutes. Expiry is not an error
 * here: the sign-in status already offers Reconnect.
 */
export function reportGoogleError(e: unknown, calendarName?: string) {
  if (e instanceof GoogleApiError && e.kind === 'expired') return;
  const base = e instanceof GoogleApiError ? e.message : `Google Calendar: ${String((e as Error)?.message ?? e)}`;
  const message = calendarName && !(e instanceof GoogleApiError && e.kind === 'api-disabled') ? `${calendarName}: ${base}` : base;
  const help = e instanceof GoogleApiError ? e.help : undefined;
  if (useGoogleError.getState().error?.message !== message) toast(message);
  useGoogleError.setState({ error: { message, help } });
}

export function clearGoogleError() {
  if (useGoogleError.getState().error) useGoogleError.setState({ error: undefined });
}
