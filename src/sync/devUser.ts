import { forgetSession } from '../lib/gate.js';
import { LS } from '../lib/storage.js';

/* Kept apart from browser.ts, which is loaded only when syncing is on, so the Account panel can use it without pulling the sync code in. */

const USER_KEY = 'flag:apiUser';
const NAME = /^[a-z0-9_-]{1,40}$/;

/** The header a development build sends. `name` is what the browser remembers: a dev user's name, or "off" to send nothing (be a
 *  stranger, to try the landing page and the real Google sign-in). Anything else is the default dev user. Production sends nothing. */
export function devHeader(name: unknown, dev: boolean): Record<string, string> {
  if (!dev || name === 'off') return {};
  return { 'x-dev-user': typeof name === 'string' && NAME.test(name) ? name : 'dev' };
}

// A development build names a fixed dev user in a header, which the API accepts only
// when it runs in development. A production build sends nothing, so the API answers 401 and the sync waits.
export const signIn = (): Record<string, string> => devHeader(LS.get(USER_KEY), import.meta.env.DEV);

/** Development only. Open the app once with ?devUser=off to be a stranger (the landing page, then real Google sign-in), or
 *  ?devUser=dev (or any name) to go back to a fake dev user. It is remembered, then taken out of the address. */
export function applyDevUserFromUrl() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(location.search);
  const value = params.get('devUser');
  if (value === null) return;
  if (value === 'off' || NAME.test(value)) {
    LS.set(USER_KEY, value);
    if (value === 'off') forgetSession(LS); // a browser that has seen a session would skip the landing page
  }
  params.delete('devUser');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
}
