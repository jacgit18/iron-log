import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import App from './App.jsx';
import { applyAppearance } from './lib/appearance.js';
import { initPwa } from './lib/pwa.js';
import { useAppStore } from './store/useAppStore.js';

applyAppearance();
initPwa();
// Start loading before the first render. Saved in this browser, the data is read right away, so the
// first frame already shows it instead of a "Loading…" frame that the page then jumps away from.
useAppStore.getState().init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
