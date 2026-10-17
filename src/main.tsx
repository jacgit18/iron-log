import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import './utilities.css';
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
import { installErrorReporting, reportCaught, sendReport } from './sync/reportErrors.js';
import { useAppStore } from './store/useAppStore.js';

applyAppearance();
initPwa();
applyDevUserFromUrl(); // development only: ?devUser=off to be a stranger
// Errors on this phone reach the server's log in every build, syncing on or not (ADR 013). Not in development, where the console is right there.
if (!import.meta.env.DEV) installErrorReporting({ version: __APP_VERSION__, send: sendReport });

// An error React caught (an ErrorBoundary, an error it recovered from, or one nothing caught) never reaches window's error event, so it is
// handed to the reporter (sync/reportErrors.ts) here, with the same once-each and per-load limit. Not sent in a development build.
const handed = (error: unknown) => { console.error(error); reportCaught(error); };
const root = createRoot(document.getElementById('root')!, { onCaughtError: handed, onUncaughtError: handed, onRecoverableError: handed });
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
  }).catch(reportCaught); // a failed check keeps what the browser last knew
}

// With syncing on, a visitor this browser has never seen signed in gets the landing page instead of the app (src/lib/gate.ts). Everyone
// else, and every build with syncing off, goes straight to the app exactly as before, with nothing to wait for.
if (quickGate(apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC), LS) === 'app') {
  openApp();
} else {
  show(<Splash />);
  decideGate(createAccountClient({ headers: devHeaders }).me, LS, reportCaught)
    .then(d => (d === 'app' ? openApp() : show(<Landing offline={d === 'landing-offline'} />)));
}
