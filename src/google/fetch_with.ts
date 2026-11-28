/**
 * @fileoverview Google API requests for any app in this repository, each
 * with its own token: retries, and errors as GoogleApiError.
 */

import {classify, GoogleApiError, isRetryable, type Service} from './errors';

/** Retry policy for rate limits and server errors (exponential backoff with jitter). Tests shorten it. */
export const retryPolicy = {attempts: 3, baseMs: 800};

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Where a request gets its token, and how it says the token expired. */
export interface TokenSource {
  current(): {value: string; expiresAt: number} | undefined;
  /** The token `used` was refused or ran out. */
  expire(used: string): void;
}

/**
 * A Google API request with the signed-in user's token (from `tokens`). Rate limits and server
 * errors are retried, except for POST, which isn't safe to repeat (it could
 * create something twice). Any failure is thrown as a GoogleApiError.
 */
export async function googleFetchWith(
  tokens: TokenSource,
  service: Service,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const retries = (init.method ?? 'GET') === 'POST' ? 1 : retryPolicy.attempts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(tokens, service, url, init);
    } catch (e) {
      if (!isRetryable(e) || attempt + 1 >= retries) throw e;
      await sleep(
        retryPolicy.baseMs * 2 ** attempt * (1 + Math.random() * 0.3),
      );
    }
  }
}

async function fetchOnce(
  tokens: TokenSource,
  service: Service,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const token = tokens.current();
  // Signed out (or disconnected): nothing has expired.
  if (!token) throw new GoogleApiError('expired', 'Google session expired');
  if (token.expiresAt < Date.now()) {
    tokens.expire(token.value);
    throw new GoogleApiError('expired', 'Google session expired');
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {...init.headers, Authorization: `Bearer ${token.value}`},
    });
  } catch {
    throw new GoogleApiError('offline', 'Can’t reach Google. Are you offline?');
  }
  if (res.status === 401) {
    tokens.expire(token.value);
    throw new GoogleApiError('expired', 'Google session expired', 401);
  }
  if (!res.ok)
    throw classify(res.status, await res.json().catch(() => null), service);
  return res;
}
