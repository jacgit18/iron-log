// Renders the link-preview image (public/og-image.png, 1200x630) and the browser-default icon (public/favicon.ico) from public/logo.svg.
// Run it when the logo or the tagline changes: node scripts/make-share-images.mjs (Playwright and its Chromium are already installed for the e2e suite).
// The image uses the app's own fonts (@fontsource Barlow Condensed and Barlow) embedded as data, so the result does not depend on this computer's fonts.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const logo = await readFile(new URL('../public/logo.svg', import.meta.url), 'utf8');
const font = async (pkg, file) => `data:font/woff2;base64,${(await readFile(new URL(`../node_modules/@fontsource/${pkg}/files/${file}`, import.meta.url))).toString('base64')}`;
const headingFont = await font('barlow-condensed', 'barlow-condensed-latin-700-normal.woff2');
const bodyFont = await font('barlow', 'barlow-latin-500-normal.woff2');

const TAGLINE = 'A weekly training board that remembers your lifts.';
const card = `<html><head><style>
@font-face{font-family:H;font-weight:700;src:url(${headingFont}) format('woff2')}
@font-face{font-family:B;font-weight:500;src:url(${bodyFont}) format('woff2')}
body{margin:0;width:1200px;height:630px;background:#1E2326;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box}
.logo{width:280px;height:280px;flex:none}
h1{margin:0;font:700 148px/0.95 H,Arial,sans-serif;color:#E3BE55;letter-spacing:1px}
p{margin:28px 0 0;font:500 44px/1.25 B,Arial,sans-serif;color:#E6EAE7;max-width:640px}
</style></head><body>${logo.replace('<svg ', '<svg class="logo" ')}<div><h1>Loadbearer</h1><p>${TAGLINE}</p></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(card);
await page.evaluate(() => document.fonts.ready);
await writeFile(new URL('../public/og-image.png', import.meta.url), await page.screenshot());
console.log('wrote public/og-image.png');

// favicon.ico: PNG pictures inside an ICO container (16, 32 and 48 px), which every current browser reads.
const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) {
  const icon = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await icon.setContent(`<html><body style="margin:0;background:transparent">${logo.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  pngs.push(await icon.screenshot({ omitBackground: true }));
  await icon.close();
}
await browser.close();
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // width
  entry.writeUInt8(size, 1); // height
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngs[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return entry;
});
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ...entries, ...pngs]));
console.log('wrote public/favicon.ico');
