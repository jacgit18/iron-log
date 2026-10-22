import { LS } from '../lib/storage.js';
import { createAccountClient } from './account.js';
import { signIn } from './devUser.js';
import { createApiDb } from './apiDb.js';
import { createTransport } from './transport.js';

/* ---------- The sync adapter, set up for the browser ----------
   Everything that needs the page (storage, visibility, the network events, the build id) is here, so apiDb.ts itself stays
   free of the DOM and can be tested without it. */

export function createBrowserApiDb(hooks: { onOwnerChange?: () => void } = {}) {
  const account = createAccountClient({ headers: signIn });
  // Whose data this page holds, as of the last time it checked who is signed in. Kept in memory on purpose: localStorage is shared by every window,
  // and a window that has since switched account must not make this one look current. Sent so the server can refuse a request from a stale page.
  let expectedUser: string | null = null;
  const sync = async () => ({ ...(await signIn()), ...(expectedUser ? { 'x-expected-user': expectedUser } : {}) });
  return createApiDb({
    identity: account.me,
    transport: createTransport({ clientVersion: __APP_VERSION__, headers: sync }),
    storage: LS,
    onOwnerChange: hooks.onOwnerChange,
    onVerified: userId => { expectedUser = userId; },
    visible: () => document.visibilityState !== 'hidden',
    onWake: wake => {
      const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', wake);
      return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', wake); };
    },
  });
}
