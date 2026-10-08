import { LS } from '../lib/storage.js';
import { signIn } from './devUser.js';
import { createApiDb } from './apiDb.js';
import { createTransport } from './transport.js';

/* ---------- The sync adapter, set up for the browser ----------
   Everything that needs the page (storage, visibility, the network events, the build id) is here, so apiDb.ts itself stays
   free of the DOM and can be tested without it. */

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
