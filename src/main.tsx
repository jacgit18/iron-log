import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import App from './App.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import Landing, { Splash } from './components/Landing.js';
import { setAdmin } from './features.js';
import { applyAppearance } from './lib/appearance.js';
import { decideGate, quickGate } from './lib/gate.js';
import { initPwa } from './lib/pwa.js';
import { LS } from './lib/storage.js';
import { apiSyncEnabled, FLAG_KEY } from './sync/flag.js';
import { createAccountClient } from './sync/account.js';
import { applyDevUserFromUrl, signIn as devHeaders } from './sync/devUser.js';
import { sendReport } from './sync/reportErrors.js';
import { useAppStore } from './store/useAppStore.js';

applyAppearance();
initPwa();
applyDevUserFromUrl(); // development only: ?devUser=off to be a stranger

// An error an ErrorBoundary caught never reaches window's error event, so the reporting in sync/browser.ts would not see it: send it
// from here, on the same terms (syncing on, not a development build, a few per page load).
let caught = 0;
const root = createRoot(document.getElementById('root')!, {
  onCaughtError(error) {
    console.error(error);
    if (import.meta.env.DEV || caught >= 5 || !apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC)) return;
    caught++;
    const e = error instanceof Error ? error : new Error(String(error));
    sendReport({ kind: 'error', message: e.message || 'unknown error', stack: e.stack ?? '', page: window.location.pathname, version: __APP_VERSION__ });
  },
});
const show = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>);
// Start loading before the first render. Saved in this browser, the data is read right away, so the
// first frame already shows it instead of a "Loading…" frame that the page then jumps away from.
const openApp = () => { useAppStore.getState().init(); show(<ErrorBoundary where="app"><App /></ErrorBoundary>); learnAdmin(); };

// With syncing on, ask the API whether this account is an admin (src/features.ts). Offline or unreachable keeps what the browser last knew.
function learnAdmin() {
  if (!apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC)) return;
  void createAccountClient({ headers: devHeaders }).me().then(s => {
    if (s.status === 'signed-in') setAdmin(s.isAdmin);
    else if (s.status === 'signed-out') setAdmin(false);
  });
}

// With syncing on, a visitor this browser has never seen signed in gets the landing page instead of the app (src/lib/gate.ts). Everyone
// else, and every build with syncing off, goes straight to the app exactly as before, with nothing to wait for.
if (quickGate(apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC), LS) === 'app') {
  openApp();
} else {
  show(<Splash />);
  decideGate(createAccountClient({ headers: devHeaders }).me, LS).then(d => (d === 'app' ? openApp() : show(<Landing offline={d === 'landing-offline'} />)));
}
