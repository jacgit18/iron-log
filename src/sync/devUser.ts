import { forgetSession } from '../lib/gate.js';
import { LS } from '../lib/storage.js';

/* Kept apart from browser.ts, which is loaded only when syncing is on, so the Account panel can use it without pulling the sync code in. */

const USER_KEY = 'flag:apiUser';
const NAME = /^[a-z0-9_-]{1,40}$/;

/** The header a development build sends. `name` is what the browser remembers: a dev user's name (the landing page's skip button
 *  chooses "dev"), or nothing. With no name, or "off", nothing is sent: a development browser is a stranger by default, so it shows
 *  the landing page and the real Google sign-in like a visitor to the live site would. Production never sends it. */
export function devHeader(name: unknown, dev: boolean): Record<string, string> {
  if (!dev || name === 'off') return {};
  return typeof name === 'string' && NAME.test(name) ? { 'x-dev-user': name } : {};
}

// A development build can name a fake dev user in a header, which the API accepts only when it runs in development. A production
// build sends nothing, so the API answers 401 and the sync waits.
export const signIn = (): Record<string, string> => devHeader(LS.get(USER_KEY), import.meta.env.DEV);

/** Development only: remember which fake user this browser is ("off", or nothing at all, is a stranger). Going off also forgets the session, because a
 *  browser that has seen one skips the landing page. Anything that is not "off" or a plain lowercase name is ignored. */
export function setDevUser(value: string) {
  if (value !== 'off' && !NAME.test(value)) return;
  LS.set(USER_KEY, value);
  if (value === 'off') forgetSession(LS);
}

/** Development only. Open the app once with ?devUser=dev (or any plain lowercase name) to be that fake user, or ?devUser=off to be a
 *  stranger again (the default). It is remembered, then taken out of the address. */
export function applyDevUserFromUrl() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(location.search);
  const value = params.get('devUser');
  if (value === null) return;
  setDevUser(value);
  params.delete('devUser');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
}
