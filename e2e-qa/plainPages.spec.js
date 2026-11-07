import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// The plain pages and files the server hands out, on the production build (QA scenarios S-76, S-78, S-98 and S-100). The status codes and the path
// allowlist are covered by server/static.test.ts; this checks them in a real browser, signed out and signed in.
const securityErrors = /Content Security Policy|Permissions Policy|Refused to/i;
const watchConsole = page => { const bad = []; page.on('console', m => { if (m.type() === 'error' && securityErrors.test(m.text())) bad.push(m.text()); }); return bad; };
const styled = page => page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily }));

test('S-76: a wrong address shows Page not found, never repeats the address, and Go to Loadbearer leads back', async ({ browser }) => {
  const stranger = await browser.newContext({ serviceWorkers: 'block' });
  const out = await stranger.newPage();
  const res = await out.goto('/zzz');
  expect(res.status()).toBe(404);
  await expect(out.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(out.getByText('That address does not exist.')).toBeVisible();
  expect(await out.locator('body').innerText()).not.toContain('zzz');
  const look = await styled(out);
  await out.getByRole('link', { name: 'Go to Loadbearer' }).click();
  await expect(out).toHaveURL(/\/$/);
  await expect(out.locator('#account-badge')).toHaveCount(0); // signed out: the landing page, not the app
  await stranger.close();
  const { context, page } = await signInAs(browser, 'new-user');
  await page.goto('/zzz');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(await styled(page)).toEqual(look); // the same page signed in and out
  await page.getByRole('link', { name: 'Go to Loadbearer' }).click();
  await expect(page.locator('#account-badge')).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test('S-78: the real pages and files still open, a missing file is a plain 404, and #/progress/zzz opens Progress', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'new-user');
  for (const path of ['/plans', '/delete-account', '/privacy.html']) expect((await page.request.get(path)).status(), path).toBe(200);
  const missing = await page.request.get('/assets/old.js');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toMatch(/<div id="root"|<script/i); // a small plain error, not the app
  await page.goto('/#/progress/zzz');
  await expect(page.locator('#tab-progress')).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await context.close();
});

test('S-100: the sitemap and icon load, the plain pages have their own titles, and the app tab says Loadbearer', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'new-user');
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const locs = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  expect(locs).toHaveLength(5);
  for (const l of locs) expect(new URL(l).origin, l).toBe('https://loadbearer.app'); // compare the origin, not a string prefix (a host like loadbearer.app.evil.test would pass startsWith)
  const icon = await page.request.get('/favicon.ico');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type'] ?? '').toContain('image');
  for (const [path, title] of [['/privacy.html', 'Privacy Policy · Loadbearer'], ['/terms.html', 'Terms of Use · Loadbearer'], ['/delete-account', 'Delete your account · Loadbearer']]) {
    await page.goto(path);
    expect(await page.title(), path).toBe(title);
  }
  await page.goto('/');
  await expect(page.locator('#account-badge')).toBeVisible({ timeout: 30_000 });
  expect(await page.title()).toMatch(/Loadbearer$/); // the tab title is the screen name then the product ("Board · Loadbearer"); the QA marker is added only on the QA service
  expect(await page.title()).not.toContain('QA');
  await expect(page.locator('link[rel~="icon"]').first()).toHaveAttribute('href', /.+/);
  await context.close();
});

test('S-98: every tab and the plain pages render styled with no security errors in the console', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-fresh');
  const bad = watchConsole(page);
  await expect(page.locator('#account-badge')).toBeVisible({ timeout: 30_000 });
  for (const tab of ['daily', 'progress', 'program']) {
    await page.click(`#tab-${tab}`);
    const look = await styled(page);
    expect(look.bg, tab).not.toBe('rgba(0, 0, 0, 0)');
  }
  for (const path of ['/privacy.html', '/terms.html', '/nothing-here']) {
    await page.goto(path);
    const look = await styled(page);
    expect(look.bg, path).not.toBe('rgba(0, 0, 0, 0)');
    expect(look.font, path).toMatch(/system-ui|sans-serif/);
  }
  expect(bad).toEqual([]);
  await context.close();
});
