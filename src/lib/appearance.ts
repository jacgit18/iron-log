import { LS } from './storage.js';

// Display preferences for this device: colour theme and roomier text spacing (WCAG 1.4.8).
export interface Appearance { theme: 'system' | 'light' | 'dark'; roomy: boolean }
export const getAppearance = (): Appearance => ({ theme: 'system', roomy: false, ...(LS.get('appearance') || {}) });
export function applyAppearance(a: Appearance = getAppearance()) {
  const root = document.documentElement;
  if (a.theme === 'light' || a.theme === 'dark') root.dataset.theme = a.theme; else delete root.dataset.theme;
  if (a.roomy) root.dataset.spacing = 'roomy'; else delete root.dataset.spacing;
  const dark = a.theme === 'dark' || (a.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121614' : '#1F5E5B');
}
export function setAppearance(patch: Partial<Appearance>) { const a = { ...getAppearance(), ...patch }; LS.set('appearance', a); applyAppearance(a); return a; }
