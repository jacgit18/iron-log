import type { AccountState } from '../sync/account.js';

/* ---------- Who sees the app, and who sees the landing page ----------
   With syncing on (the deployed build), a visitor this browser has never seen signed in gets a landing page with the sign-in button
   instead of the app. Everyone else gets the app straight away, with no wait and nothing blocking, so it still opens instantly and
   offline in the gym:

     - syncing off (GitHub Pages, a build without the flag): the app, always. Nothing here applies.
     - this browser has seen a signed-in session before ("known"): the app, at once. If that session has since expired, the app
       shows its own "Sign in to sync" card and keeps the person's data reachable; it never hides it behind a page.
     - otherwise: ask the server who this is.
         signed in                    -> remember it, and the app
         signed out (a definite 401)  -> the landing page
         could not tell (offline)     -> the app if this device already holds an account's data, else the landing page with an offline note

   Signing out on purpose forgets the session, so the next load shows the landing page. The data on the device stays; a landing
   page hides the screen, it is not a lock on the browser's storage. */

export const KNOWN_KEY = 'session/known';
const OWNER_KEY = 'sync/owner'; // written by the sync adapter once an account has synced here (apiDb.ts)

export interface GateStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
  remove(key: string): void;
}

export type Decision = 'app' | 'landing' | 'landing-offline';

/** The part that needs no network: 'app' when nothing needs asking, else 'check'. */
export function quickGate(syncOn: boolean, storage: Pick<GateStorage, 'get'>): 'app' | 'check' {
  if (!syncOn) return 'app';
  return storage.get(KNOWN_KEY) === true ? 'app' : 'check';
}

/** Asks who is signed in, once, for a visitor the browser does not know. */
export async function decideGate(me: () => Promise<AccountState>, storage: GateStorage): Promise<Decision> {
  const who = await me();
  if (who.status === 'signed-in') { storage.set(KNOWN_KEY, true); return 'app'; }
  if (who.status === 'signed-out') return 'landing';
  const holdsAnAccount = !!storage.get(OWNER_KEY);
  return holdsAnAccount ? 'app' : 'landing-offline';
}

/** After signing out on purpose, or deleting the account: the next load starts at the landing page. */
export const forgetSession = (storage: Pick<GateStorage, 'remove'>) => storage.remove(KNOWN_KEY);
