import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pagePathPatterns } from './pagePaths.js';

// The files a search engine or a link preview asks for: public/sitemap.xml, robots.txt, og-image.png, favicon.ico and the tags in index.html.
// They name each other by address, so this keeps them in step (scripts/make-share-images.mjs draws the two images).
const root = join(__dirname, '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const ORIGIN = 'https://loadbearer.app';

describe('sitemap.xml', () => {
  const urls = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]!);

  it('lists absolute production addresses', () => {
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(`${ORIGIN}/`), url).toBe(true);
  });

  it('lists only pages the server answers: an app page, or a static page that exists', () => {
    for (const url of urls) {
      const path = url.slice(ORIGIN.length);
      const file = path === '/delete-account' ? 'public/delete-account.html' : `public${path}`;
      expect(pagePathPatterns().some(pattern => pattern.test(path)) || existsSync(join(root, file)), url).toBe(true);
    }
  });

  it('does not list the 404 page or a duplicate', () => {
    expect(urls.some(u => u.includes('404'))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('robots.txt', () => {
  it('points at the sitemap', () => {
    expect(read('public/robots.txt')).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});

describe('og-image.png', () => {
  const png = readFileSync(join(root, 'public/og-image.png'));

  it('is a 1200 by 630 PNG, the size the page tags declare', () => {
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it('is the image index.html names, with its size', () => {
    const html = read('index.html');
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.png">`);
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
});

describe('favicon.ico', () => {
  const ico = readFileSync(join(root, 'public/favicon.ico'));

  it('is an icon file holding PNG pictures at 16, 32 and 48 px', () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const entry = 6 + 16 * i;
      sizes.push(ico.readUInt8(entry));
      const start = ico.readUInt32LE(entry + 12);
      expect(ico.subarray(start + 1, start + 4).toString(), `picture ${i}`).toBe('PNG');
      expect(start + ico.readUInt32LE(entry + 8)).toBeLessThanOrEqual(ico.length);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });
});
