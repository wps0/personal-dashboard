import {describe, expect, it} from 'vitest';
import {classify, isRetryable} from './errors';

describe('classify', () => {
  it('recognises a disabled Calendar API and links to where it is enabled', () => {
    const e = classify(403, {
      error: {
        code: 403,
        status: 'PERMISSION_DENIED',
        errors: [
          {
            reason: 'accessNotConfigured',
            extendedHelp:
              'https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=1',
          },
        ],
        details: [
          {
            reason: 'SERVICE_DISABLED',
            metadata: {
              activationUrl:
                'https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=1',
            },
          },
        ],
      },
    });
    expect(e.kind).toBe('api-disabled');
    expect(e.help).toContain('calendar-json.googleapis.com');
    expect(isRetryable(e)).toBe(false);
  });

  it('treats 429 and rate-limit reasons as retryable', () => {
    expect(classify(429, null).kind).toBe('rate-limit');
    const e = classify(403, {
      error: {errors: [{reason: 'userRateLimitExceeded'}]},
    });
    expect(e.kind).toBe('rate-limit');
    expect(isRetryable(e)).toBe(true);
    expect(isRetryable(classify(503, null))).toBe(true);
  });

  it('explains missing permissions, missing calendars and anything else', () => {
    expect(
      classify(403, {error: {errors: [{reason: 'insufficientPermissions'}]}})
        .kind,
    ).toBe('permission');
    expect(classify(404, {}).kind).toBe('not-found');
    const other = classify(400, {error: {message: 'Bad Request'}});
    expect([other.kind, other.message]).toEqual([
      'other',
      'Google Calendar error 400: Bad Request',
    ]);
  });
});
