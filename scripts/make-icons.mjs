// Renders the PWA icons in public/icons/ and the iOS launch screens in public/splash/ from public/logo.svg.
// Usage: npm i -D playwright && npx playwright install chromium && node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';

const logo = await readFile(new URL('../public/logo.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
const splashOut = new URL('../public/splash/', import.meta.url);
await mkdir(out, { recursive: true });
await mkdir(splashOut, { recursive: true });
// The logo's shapes without its rounded background square, for full-bleed icons.
const inner = logo.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect width="64" height="64"[^>]*\/>/, '');
const BG = '#1E2326';
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
// iOS launch screens: the logo (23% of the width) centred on the page background.
for (const [w, h] of [[1125, 2436], [1170, 2532], [1179, 2556], [1284, 2778], [1290, 2796]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const side = Math.round(w * 0.2276);
  await page.setContent(`<html><body style="margin:0;background:#EEF0EC;display:flex;align-items:center;justify-content:center;height:100vh">${logo.replace('<svg ', `<svg width="${side}" height="${side}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`splash-${w}x${h}.png`, splashOut).pathname });
  await page.close();
  console.log('wrote', `splash-${w}x${h}.png`);
}
await browser.close();
