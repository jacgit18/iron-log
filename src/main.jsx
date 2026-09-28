import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import App from './App.jsx';
import { applyAppearance } from './lib/appearance.js';
import { initPwa } from './lib/pwa.js';

applyAppearance();
initPwa();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
