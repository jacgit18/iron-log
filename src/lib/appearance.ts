import { LS } from './storage.js';

// Display preferences for this device: colour theme and roomier text spacing (WCAG 1.4.8).
export interface Appearance { theme: 'system' | 'light' | 'dark'; roomy: boolean }
export const getAppearance = (): Appearance => ({ theme: 'system', roomy: false, ...(LS.get('appearance') || {}) });
export function applyAppearance(a: Appearance = getAppearance()) {
  const root = document.documentElement;
  if (a.theme === 'light' || a.theme === 'dark') root.dataset.theme = a.theme; else delete root.dataset.theme;
  if (a.roomy) root.dataset.spacing = 'roomy'; else delete root.dataset.spacing;
  const dark = a.theme === 'dark' || (a.theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // index.html has one theme-color per OS scheme (so the first paint matches). An explicit choice here overrides both; "system" restores each.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const own = (m.getAttribute('media') || '').includes('dark');
    const useDark = a.theme === 'system' ? own : dark;
    m.setAttribute('content', useDark ? '#121614' : '#1F5E5B');
  });
}
export function setAppearance(patch: Partial<Appearance>) { const a = { ...getAppearance(), ...patch }; LS.set('appearance', a); applyAppearance(a); return a; }

// The colours button in the header (ThemeButton.tsx) steps through these in order, one tap each, and wraps.
export type Theme = Appearance['theme'];
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const THEME_NAME: Record<Theme, string> = { system: 'match this device', light: 'light', dark: 'dark' };
export const nextTheme = (t: Theme): Theme => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]!;
/** The button's accessible name and tooltip: where it is now and where the next tap goes. */
export const themeButtonLabel = (t: Theme): string => `Colours: ${THEME_NAME[t]}. Switch to ${THEME_NAME[nextTheme(t)]}`;
