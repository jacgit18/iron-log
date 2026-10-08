import { LS } from '../lib/storage.js';
import { createApiDb } from './apiDb.js';
import { createTransport } from './transport.js';

/* ---------- The sync adapter, set up for the browser ----------
   Everything that needs the page (storage, visibility, the network events, the build id) is here, so apiDb.ts itself stays
   free of the DOM and can be tested without it. */

const USER_KEY = 'flag:apiUser';

// Until real sign-in exists (Phase B), a development build names a fixed dev user in a header, which the API accepts only
// when it runs in development. A production build sends nothing, so the API answers 401 and the sync waits.
function signIn(): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  const name = LS.get(USER_KEY);
  return { 'x-dev-user': typeof name === 'string' && /^[a-z0-9_-]{1,40}$/.test(name) ? name : 'dev' };
}

export function createBrowserApiDb() {
  return createApiDb({
    transport: createTransport({ clientVersion: __APP_VERSION__, headers: signIn }),
    storage: LS,
    visible: () => document.visibilityState !== 'hidden',
    onWake: wake => {
      const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', wake);
      return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', wake); };
    },
  });
}
