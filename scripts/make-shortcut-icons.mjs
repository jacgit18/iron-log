// Draws the four long-press shortcut icons in public/shortcut-icons/ (gold line glyph on the app's dark ink, 192 px, transparent corners).
// They live outside public/icons/ on purpose: server/appLabel.ts rewrites everything under icons/ to the QA or Staging copy, which has no shortcut icons.
// Usage: CHROME=/path/to/chrome node scripts/make-shortcut-icons.mjs   (any headless-capable Chrome or Chromium; no npm package needed)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chrome = process.env.CHROME ?? 'chromium';
const out = new URL('../public/shortcut-icons/', import.meta.url).pathname;
// 24-unit stroke glyphs; the names are the file names the manifests use (vite.config.js, android/twa-manifest.json).
const GLYPHS = {
  today: 'M3 12h18M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4',
  daily: 'M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
  progress: 'M4 19V5M4 19h16M7 15l4-4 3 3 5-6',
  nutrition: 'M6 3v6a2 2 0 004 0V3M8 3v18M17 21V3c-2 1-3 4-3 8h3',
};
const svg = d => `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#1E2326"/><g transform="translate(8 8)" fill="none" stroke="#E3BE55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g></svg>`;

mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'shortcut-icons-'));
for (const [name, d] of Object.entries(GLYPHS)) {
  const page = join(tmp, `${name}.html`);
  writeFileSync(page, `<html><body style="margin:0;background:transparent">${svg(d)}</body></html>`);
  execFileSync(chrome, ['--headless', '--no-sandbox', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=192,192', `--screenshot=${out}${name}.png`, `file://${page}`], { stdio: 'ignore' });
  console.log('wrote', `${name}.png`);
}
