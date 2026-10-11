/** What went wrong talking to Google, in terms the UI can explain and act on. */
type ErrorKind =
  | 'api-disabled'
  | 'permission'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'offline'
  | 'expired'
  | 'other';

export class GoogleApiError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly status?: number,
    /** A page that fixes it (e.g. enabling the Calendar API in the project). */
    readonly help?: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

const ENABLE_API_URL =
  'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com';

/** Shape of a Google API error body (https://cloud.google.com/apis/design/errors). */
interface ErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: {reason?: string; extendedHelp?: string}[];
    details?: {reason?: string; metadata?: {activationUrl?: string}}[];
  };
}

/** Turns a failed response into a classified, human-readable error. */
export function classify(status: number, body: unknown): GoogleApiError {
  const err = (body as ErrorBody | null)?.error;
  const reasons = [
    ...(err?.errors ?? []).map(e => e.reason),
    ...(err?.details ?? []).map(d => d.reason),
    err?.status,
  ].filter(Boolean) as string[];
  const has = (...r: string[]) => reasons.some(x => r.includes(x));

  if (
    status === 429 ||
    has(
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'quotaExceeded',
      'RATE_LIMIT_EXCEEDED',
      'RESOURCE_EXHAUSTED',
    )
  ) {
    return new GoogleApiError(
      'rate-limit',
      'Google is limiting requests right now. Retrying shortly.',
      status,
    );
  }
  if (has('accessNotConfigured', 'SERVICE_DISABLED')) {
    const help =
      err?.details?.find(d => d.metadata?.activationUrl)?.metadata
        ?.activationUrl ??
      err?.errors?.find(e => e.extendedHelp)?.extendedHelp ??
      ENABLE_API_URL;
    return new GoogleApiError(
      'api-disabled',
      'The Google Calendar API isn’t enabled in your Google Cloud project. Enable it, wait a minute, then retry.',
      status,
      help,
    );
  }
  if (
    status === 403 &&
    has(
      'insufficientPermissions',
      'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      'forbidden',
    )
  ) {
    return new GoogleApiError(
      'permission',
      'A read permission is missing. Sign out, sign in again and keep both permissions ticked.',
      status,
    );
  }
  if (status === 404)
    return new GoogleApiError(
      'not-found',
      'Calendar not found. Was it removed or unshared?',
      status,
    );
  if (status >= 500)
    return new GoogleApiError(
      'server',
      'Google Calendar is having trouble. Retrying shortly.',
      status,
    );
  return new GoogleApiError(
    'other',
    `Google Calendar error ${status}${err?.message ? `: ${err.message}` : ''}`,
    status,
  );
}

/** Worth retrying automatically with backoff. */
export const isRetryable = (e: unknown) =>
  e instanceof GoogleApiError &&
  (e.kind === 'rate-limit' || e.kind === 'server');
