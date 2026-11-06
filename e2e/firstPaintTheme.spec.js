import { test, expect } from '@playwright/test';

// Brief polish-theme-flash-pressed-errors: the saved colour theme is on <html> and the page background is right before the app bundle runs,
// so a person who chose dark never sees a white flash. The bundle is blocked here; only index.html and public/theme-init.js have run.
// A unit test cannot see this: it is the paint order of the real page.
const DARK = 'rgb(22, 26, 28)'; // --bg in dark, src/styles.css
const LIGHT = 'rgb(246, 246, 243)'; // --bg in light

async function firstPaint(page, { saved, os }) {
  await page.emulateMedia({ colorScheme: os });
  if (saved !== undefined) await page.addInitScript(v => localStorage.setItem('ironlog:appearance', v), saved);
  let blocked = 0;
  await page.route('**/assets/**/*.js', route => { blocked++; return route.abort(); });
  await page.goto('/');
  expect(blocked, 'the app bundle must be blocked, or this proves nothing').toBeGreaterThan(0);
  return page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? null, bg: getComputedStyle(document.body).backgroundColor }));
}

const CASES = [
  { name: 'saved dark, OS light: dark', saved: JSON.stringify({ theme: 'dark', roomy: false }), os: 'light', theme: 'dark', bg: DARK },
  { name: 'saved light, OS dark: light', saved: JSON.stringify({ theme: 'light', roomy: false }), os: 'dark', theme: 'light', bg: LIGHT },
  { name: 'saved system, OS dark: follows the OS (dark)', saved: JSON.stringify({ theme: 'system', roomy: false }), os: 'dark', theme: null, bg: DARK },
  { name: 'nothing saved, OS light: light', saved: undefined, os: 'light', theme: null, bg: LIGHT },
  { name: 'a damaged saved value is ignored, OS dark: dark', saved: 'not json{', os: 'dark', theme: null, bg: DARK },
];

for (const c of CASES) {
  test(`first paint, ${c.name}`, async ({ page }) => {
    const got = await firstPaint(page, c);
    expect(got).toEqual({ theme: c.theme, bg: c.bg });
  });
}

test('the theme script is a file the page policy allows, not an inline script', async ({ page }) => {
  const res = await page.goto('/');
  const html = await res.text();
  expect(html).toContain('<script src="/theme-init.js"></script>');
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // no inline script anywhere in the shell
});
