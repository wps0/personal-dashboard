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

/** The Google API a request went to; errors name it and link to its settings. */
export type Service = 'calendar' | 'drive';

const SERVICES: Record<
  Service,
  {name: string; enableUrl: string; permission: string; notFound: string}
> = {
  calendar: {
    name: 'Google Calendar',
    enableUrl:
      'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    permission:
      'A read permission is missing. Sign out, sign in again and keep both permissions ticked.',
    notFound: 'Calendar not found. Was it removed or unshared?',
  },
  drive: {
    name: 'Google Drive',
    enableUrl:
      'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    permission:
      'Drive access is missing. Turn sync off and on again, and allow access to the files the app creates.',
    notFound: 'The sync file wasn’t found in Google Drive.',
  },
};

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
export function classify(
  status: number,
  body: unknown,
  service: Service = 'calendar',
): GoogleApiError {
  const svc = SERVICES[service];
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
      svc.enableUrl;
    return new GoogleApiError(
      'api-disabled',
      `The ${svc.name} API isn’t enabled in your Google Cloud project. Enable it, wait a minute, then retry.`,
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
    return new GoogleApiError('permission', svc.permission, status);
  }
  if (status === 404)
    return new GoogleApiError('not-found', svc.notFound, status);
  if (status >= 500)
    return new GoogleApiError(
      'server',
      `${svc.name} is having trouble. Retrying shortly.`,
      status,
    );
  return new GoogleApiError(
    'other',
    `${svc.name} error ${status}${err?.message ? `: ${err.message}` : ''}`,
    status,
  );
}

/** Worth retrying automatically with backoff. */
export function isRetryable(e: unknown) {
  return (
    e instanceof GoogleApiError &&
    (e.kind === 'rate-limit' || e.kind === 'server')
  );
}
