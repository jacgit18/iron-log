import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Push alerts from the phone's side (ADR 044, PR 6). Service workers are blocked in these tests, so a stand-in browser subscription is
// installed before the page loads, and every /api/push call is recorded and answered here. What reaches the server is what is checked.
const NOW = new Date('2026-09-24T18:30:00-04:00'); // a Thursday; the board's week is this week

async function setup(page, { admin = true, on = true, now = NOW } = {}) {
  const calls = [];
  await page.addInitScript(({ admin, on }) => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    if (on) localStorage.setItem('ironlog:webPush', 'true');
    let sub = on ? { endpoint: 'https://push.example/phone-1', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'k', auth: 'a' } }; }, unsubscribe: async () => { sub = null; return true; } } : null;
    const registration = {
      pushManager: {
        getSubscription: async () => sub,
        subscribe: async () => { sub = { endpoint: 'https://push.example/phone-1', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'k', auth: 'a' } }; }, unsubscribe: async () => { sub = null; return true; } }; return sub; },
      },
    };
    Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve(registration), configurable: true });
    window.PushManager = window.PushManager || function PushManager() {};
    let permission = 'default';
    const N = function Notification() {};
    Object.defineProperty(N, 'permission', { get: () => (on ? 'granted' : permission) });
    N.requestPermission = async () => { permission = 'granted'; return 'granted'; };
    window.Notification = N;
  }, { admin, on });
  await page.route('**/api/push/**', async route => {
    const url = new URL(route.request().url());
    const body = route.request().postData();
    calls.push({ path: url.pathname.replace('/api/push', ''), method: route.request().method(), body: body ? JSON.parse(body) : null });
    const publicKey = 'B'.repeat(87);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/key') ? { ok: true, publicKey } : { ok: true }) });
  });
  await page.clock.install({ time: now });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  return calls;
}
const scheduled = calls => calls.filter(c => c.path === '/schedule' || c.path === '/cancel');
const day1Boxes = page => page.locator('.col.sel article.card > .row1 > input.chk');
// A ticked card sinks to the end of its day, so a locator for "the first card" moves on after each tick: pin the card by its checkbox id.
const firstOpen = async page => page.locator(`#${await page.locator('.col.sel article.card:not(.done) > .row1 > input.chk').first().getAttribute('id')}`);

test('Settings offers push to an admin, and turning it on subscribes this device', async ({ page }) => {
  const calls = await setup(page, { on: false });
  await page.locator('#tab-settings, #account-badge').first().click();
  const panel = page.getByRole('region', { name: 'Alerts when Iron Log is closed' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: /Send alerts to this device/ })).not.toBeChecked();
  await panel.getByRole('checkbox', { name: /Send alerts to this device/ }).click(); // the box follows the answer from the server, so it is not ticked at once
  await expect(panel.getByRole('checkbox', { name: /When a rest or hold ends/ })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /started but not finished/ })).toBeChecked();
  expect(calls.map(c => `${c.method} ${c.path}`)).toEqual(['GET /key', 'POST /subscribe']);
  expect(calls[1].body).toEqual({ endpoint: 'https://push.example/phone-1', keys: { p256dh: 'k', auth: 'a' } });
  await panel.getByRole('checkbox', { name: /Send alerts to this device/ }).click();
  await expect(panel.getByRole('checkbox', { name: /When a rest or hold ends/ })).toHaveCount(0);
  expect(calls.at(-1)).toEqual({ path: '/unsubscribe', method: 'POST', body: { endpoint: 'https://push.example/phone-1' } });
});

test('is not offered to an account that is not an admin', async ({ page }) => {
  const calls = await setup(page, { admin: false, on: false });
  await page.locator('#tab-settings, #account-badge').first().click();
  await expect(page.getByRole('heading', { name: 'Rest timer alert' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Alerts when Iron Log is closed' })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('ticking a card on a day with more to do asks for a nudge 30 minutes on; finishing the day takes it back', async ({ page }) => {
  const calls = await setup(page);
  const n = await day1Boxes(page).count();
  expect(n).toBeGreaterThan(2);
  await (await firstOpen(page)).check();
  await expect.poll(() => scheduled(calls).length).toBe(1);
  const ask = scheduled(calls)[0];
  expect(ask.path).toBe('/schedule');
  expect(ask.body).toMatchObject({ endpoint: 'https://push.example/phone-1', kind: 'day-nudge' });
  expect(ask.body.at).toBe(Number(ask.body.key) + 30 * 60_000); // the key is the tick time; the nudge is 30 minutes after it
  expect(Math.abs(Number(ask.body.key) - NOW.getTime())).toBeLessThan(60_000);
  expect(ask.body.body).toBe(`Day not finished: ${n - 1} ${n - 1 === 1 ? 'exercise' : 'exercises'} left.`);
  await (await firstOpen(page)).check(); // a second tick moves it on, with one less left
  await expect.poll(() => scheduled(calls).filter(c => c.path === '/schedule').length).toBe(2);
  expect(scheduled(calls).at(-1).body.body).toBe(`Day not finished: ${n - 2} ${n - 2 === 1 ? 'exercise' : 'exercises'} left.`);
  await page.locator('.col.sel .colhead input.chk').check(); // the day's own box finishes the whole day
  await expect.poll(() => scheduled(calls).at(-1)?.path).toBe('/cancel');
  expect(scheduled(calls).at(-1).body).toEqual({ endpoint: 'https://push.example/phone-1', kind: 'day-nudge' });
  expect(scheduled(calls).filter(c => c.path === '/schedule')).toHaveLength(2);
});

test('a tick whose nudge would land after 9:30 pm asks for nothing', async ({ page }) => {
  const calls = await setup(page, { now: new Date('2026-09-24T21:10:00-04:00') });
  await (await firstOpen(page)).check();
  await expect.poll(() => scheduled(calls).length).toBeGreaterThan(0);
  expect(scheduled(calls).map(c => c.path)).toEqual(['/cancel']);
});

test('with push off on this device, ticking asks for nothing', async ({ page }) => {
  const calls = await setup(page, { on: false });
  await (await firstOpen(page)).check();
  await page.waitForTimeout(300);
  expect(calls).toEqual([]);
});

test('the push panel has no accessibility violations, off and on', async ({ page }) => {
  await setup(page, { on: true });
  await page.locator('#tab-settings, #account-badge').first().click();
  const panel = page.getByRole('region', { name: 'Alerts when Iron Log is closed' });
  await expect(panel.getByRole('checkbox', { name: /started but not finished/ })).toBeVisible();
  const scan = () => new AxeBuilder({ page }).include('#pushalerts').include('section[aria-labelledby="pushalerts"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect((await scan()).violations.map(v => v.id)).toEqual([]);
  await panel.getByRole('checkbox', { name: /Send alerts to this device/ }).click();
  await expect(panel.getByRole('checkbox', { name: /When a rest or hold ends/ })).toHaveCount(0);
  expect((await scan()).violations.map(v => v.id)).toEqual([]);
});
