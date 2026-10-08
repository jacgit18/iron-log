import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import App from './App.jsx';
import Landing, { Splash } from './components/Landing.tsx';
import { applyAppearance } from './lib/appearance.js';
import { decideGate, quickGate } from './lib/gate.ts';
import { initPwa } from './lib/pwa.js';
import { LS } from './lib/storage.js';
import { apiSyncEnabled, FLAG_KEY } from './sync/flag.ts';
import { createAccountClient } from './sync/account.ts';
import { signIn as devHeaders } from './sync/devUser.ts';
import { useAppStore } from './store/useAppStore.js';

applyAppearance();
initPwa();

const root = createRoot(document.getElementById('root'));
const show = node => root.render(<StrictMode>{node}</StrictMode>);
// Start loading before the first render. Saved in this browser, the data is read right away, so the
// first frame already shows it instead of a "Loading…" frame that the page then jumps away from.
const openApp = () => { useAppStore.getState().init(); show(<App />); };

// With syncing on, a visitor this browser has never seen signed in gets the landing page instead of the app (src/lib/gate.ts). Everyone
// else, and every build with syncing off, goes straight to the app exactly as before, with nothing to wait for.
if (quickGate(apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC), LS) === 'app') {
  openApp();
} else {
  show(<Splash />);
  decideGate(createAccountClient({ headers: devHeaders }).me, LS).then(d => (d === 'app' ? openApp() : show(<Landing offline={d === 'landing-offline'} />)));
}
