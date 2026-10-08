import { LS } from '../lib/storage.js';

/* Kept apart from browser.ts, which is loaded only when syncing is on, so the Account panel can use it without pulling the sync code in. */

const USER_KEY = 'flag:apiUser';

// A development build names a fixed dev user in a header, which the API accepts only
// when it runs in development. A production build sends nothing, so the API answers 401 and the sync waits.
export function signIn(): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  const name = LS.get(USER_KEY);
  return { 'x-dev-user': typeof name === 'string' && /^[a-z0-9_-]{1,40}$/.test(name) ? name : 'dev' };
}
