import {useGoogle} from './auth';
import type {Service} from './errors';
import {googleFetchWith, type TokenSource} from './fetch_with';

export {retryPolicy} from './fetch_with';

/** The dashboard's token: a newer one replaces one that expired meanwhile. */
const DASHBOARD: TokenSource = {
  current: () => useGoogle.getState().token,
  expire: used => {
    const {token, markExpired} = useGoogle.getState();
    if (token?.value === used) markExpired();
  },
};

/**
 * A Google API request with the signed-in user's token. Rate limits and server
 * errors are retried, except for POST, which isn't safe to repeat (it could
 * create something twice). Any failure is thrown as a GoogleApiError.
 */
export function googleFetch(
  service: Service,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return googleFetchWith(DASHBOARD, service, url, init);
}
