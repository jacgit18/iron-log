import { test, expect } from './fixtures.js';

// The Latin Extended font files (about 85 KB) have a unicode-range, so a first visit that shows no accented text does not fetch them.
test('a first visit does not download the Latin Extended fonts', async ({ page }) => {
  const fonts = [];
  page.on('requestfinished', r => { if (/\.woff2?(\?|$)/.test(r.url())) fonts.push(r.url()); });
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(fonts.length, 'the Latin fonts still load').toBeGreaterThan(0);
  expect(fonts.filter(u => u.includes('latin-ext')), 'Latin Extended fonts fetched on a plain first visit').toEqual([]);
  // ...and the file still arrives when a character in its range is shown.
  await page.evaluate(() => { const el = document.createElement('p'); el.textContent = 'Łódź'; el.style.fontFamily = 'Barlow'; document.body.append(el); });
  await expect.poll(() => fonts.filter(u => u.includes('latin-ext')).length).toBeGreaterThan(0);
});
