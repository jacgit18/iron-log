// Renders the PWA icons in public/icons/ from public/logo.svg.
// Usage (from web/): npm i -D playwright && npx playwright install chromium && node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';

const logo = await readFile(new URL('../public/logo.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });
// The logo's shapes without its rounded background square, for full-bleed icons.
const inner = logo.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect width="64" height="64"[^>]*\/>/, '');
const BG = '#1F5E5B';
// `scale` shrinks the artwork around the centre; maskable icons keep it inside the 80% safe zone.
const fullBleed = scale => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g></svg>`;

const icons = [
  ['icon-192.png', 192, logo],
  ['icon-512.png', 512, logo],
  ['maskable-512.png', 512, fullBleed(0.72)],
  ['apple-touch-icon.png', 180, fullBleed(0.86)],
];
const browser = await chromium.launch();
for (const [name, size, svg] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(name, out).pathname, omitBackground: true });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
