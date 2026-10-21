import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The drink-water reminder from the phone's side (ADR 044): what reaches /api/push is what is checked. Service workers are blocked in these tests, so a
// stand-in browser subscription is installed before the page loads, and every /api/push call is recorded and answered here (as in webPush.spec.js).
const NOW = new Date('2026-09-24T10:00:00-04:00'); // a Thursday, 10:00 in the test time zone (America/New_York)
const H = 3_600_000;
const UNTIL = new Date('2026-09-24T21:30:00-04:00').getTime();

async function setup(page, { water = false } = {}) {
  const calls = [];
  await page.addInitScript(({ water }) => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:webPush', 'true');
    if (water) localStorage.setItem('ironlog:pushWater', 'true');
    const sub = { endpoint: 'https://push.example/phone-1', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'k', auth: 'a' } }; }, unsubscribe: async () => true };
    const registration = { pushManager: { getSubscription: async () => sub, subscribe: async () => sub } };
    Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve(registration), configurable: true });
    window.PushManager = window.PushManager || function PushManager() {};
    const N = function Notification() {};
    Object.defineProperty(N, 'permission', { get: () => 'granted' });
    N.requestPermission = async () => 'granted';
    window.Notification = N;
  }, { water });
  await page.route('**/api/push/**', async route => {
    const url = new URL(route.request().url());
    const body = route.request().postData();
    calls.push({ path: url.pathname.replace('/api/push', ''), method: route.request().method(), body: body ? JSON.parse(body) : null });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/key') ? { ok: true, publicKey: 'B'.repeat(87) } : { ok: true }) });
  });
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  return calls;
}
const water = calls => calls.filter(c => (c.path === '/schedule' || c.path === '/cancel') && c.body?.kind === 'water');
// The page clock keeps running after install, so a time asked for is within a minute of the one worked out here.
const near = (got, want) => expect(Math.abs(got - want)).toBeLessThan(60_000);
const openSettings = async page => {
  await page.locator('#tab-settings, #account-badge').first().click();
  return page.getByRole('region', { name: 'Alerts when Iron Log is closed' });
};

test('is off until ticked; ticking asks for the first reminder two hours on, carrying the window end', async ({ page }) => {
  const calls = await setup(page);
  const panel = await openSettings(page);
  const box = panel.getByRole('checkbox', { name: 'Remind me to drink water' });
  await expect(box).not.toBeChecked();
  await expect(panel.getByLabel('Every')).toHaveCount(0);
  expect(water(calls)).toEqual([]); // opening the app with the box unticked asked for nothing
  await box.check();
  await expect(panel.getByLabel('Every')).toHaveValue('2');
  await expect(panel.getByLabel('From')).toHaveValue('08:00');
  await expect(panel.getByLabel('Until')).toHaveValue('21:30');
  await expect.poll(() => water(calls).length).toBe(1);
  const { path, method, body } = water(calls)[0];
  expect({ path, method }).toEqual({ path: '/schedule', method: 'POST' });
  near(body.at, NOW.getTime() + 2 * H);
  expect(body).toEqual({ endpoint: 'https://push.example/phone-1', kind: 'water', key: `w${body.at}`, at: body.at, body: 'Time for a glass of water.', repeat: { everyMs: 2 * H, until: UNTIL } });
});

test('unticking takes the reminder back; changing the interval asks again with the new one', async ({ page }) => {
  const calls = await setup(page, { water: true });
  const panel = await openSettings(page);
  await expect.poll(() => water(calls).length).toBe(1); // armed when the app opened (box already ticked on this device)
  await panel.getByLabel('Every').selectOption('1');
  await expect.poll(() => water(calls).length).toBe(2);
  near(water(calls)[1].body.at, NOW.getTime() + H);
  expect(water(calls)[1].body.repeat).toEqual({ everyMs: H, until: UNTIL });
  await panel.getByRole('checkbox', { name: 'Remind me to drink water' }).uncheck();
  await expect.poll(() => water(calls).length).toBe(3);
  expect(water(calls)[2]).toMatchObject({ path: '/cancel', body: { kind: 'water' } });
});

test('a logged drink moves the next reminder to an interval from then; reaching the goal cancels it', async ({ page }) => {
  const calls = await setup(page, { water: true });
  await expect.poll(() => water(calls).length).toBe(1);
  await page.clock.fastForward(30 * 60_000); // 10:30
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await page.click('#water-8');
  await expect.poll(() => water(calls).length).toBe(2);
  near(water(calls)[1].body.at, NOW.getTime() + 30 * 60_000 + 2 * H);
  await page.click('#water-64'); // the default goal is 64 oz
  await expect.poll(() => water(calls).length).toBe(3);
  expect(water(calls)[2]).toMatchObject({ path: '/cancel', body: { kind: 'water' } });
});

test('the water controls have names and pass the accessibility scan', async ({ page }) => {
  await setup(page, { water: true });
  const panel = await openSettings(page);
  await expect(panel.getByRole('combobox', { name: 'Every' })).toBeVisible();
  await expect(panel.getByLabel('From')).toBeVisible();
  const scan = await new AxeBuilder({ page }).include('section[aria-labelledby="pushalerts"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
});
