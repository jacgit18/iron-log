import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// "Program on a computer" (brief: briefs/program-on-computer): a one-time card on the Program tab and an always-there Settings row, on touch
// screens only. What a unit test cannot catch: the touch-versus-mouse decision from the real media query, the card floating without moving
// the editor, the real button calling the share sheet or the clipboard, and dismissal surviving a reload. The wording and the rule are unit tests.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const card = page => page.getByRole('region', { name: 'Tip: plan on a computer' });
const openTab = (page, name) => page.getByRole('tab', { name }).click();
const rowHeading = page => page.getByRole('heading', { name: 'Build programs on a computer' });
// Replaces what the phone offers, after load: the app reads these when the button is pressed.
const stubShare = (page, { share }) => page.evaluate(withShare => {
  window.__shared = []; window.__copied = [];
  Object.defineProperty(navigator, 'share', { configurable: true, value: withShare ? async d => { window.__shared.push(d); } : undefined });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied.push(t); } } });
}, share);

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test('the card shows on the Program tab and Not now hides it for good, without moving the editor', async ({ page }) => {
    await openTab(page, 'Program');
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('Planning a program is easier on a computer.');
    await expect(card(page).getByRole('button', { name: 'Send me the link' })).toBeVisible();
    const days = page.getByRole('group', { name: 'Day to edit' });
    const before = await days.boundingBox();
    expect(await scan(page).then(r => r.violations)).toEqual([]);
    await card(page).getByRole('button', { name: 'Not now' }).click();
    await expect(card(page)).toHaveCount(0);
    expect(await days.boundingBox()).toEqual(before); // it floated: the Day buttons were not pushed down or pulled back
    await page.reload();
    await openTab(page, 'Program');
    await expect(page.getByRole('heading', { name: 'Program' }).first()).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });

  test('is on the Program tab only', async ({ page }) => {
    await expect(card(page)).toHaveCount(0); // the Board
    await openTab(page, 'Progress');
    await expect(card(page)).toHaveCount(0);
    await openTab(page, 'Program');
    await expect(card(page)).toBeVisible();
  });

  test('waits while the install hint shows, and draws the moment that hint is dismissed, without a tab change', async ({ page }) => {
    await openTab(page, 'Program');
    await expect(card(page)).toBeVisible();
    await page.evaluate(() => { // the browser says the app can be installed: the install hint arrives
      const e = new Event('beforeinstallprompt');
      Object.assign(e, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
      window.dispatchEvent(e);
    });
    const hint = page.locator('#install-hint');
    await expect(hint).toBeVisible();
    await expect(card(page)).toHaveCount(0); // one floating tip at a time
    await hint.getByRole('button', { name: 'Not now' }).click();
    await expect(hint).toHaveCount(0);
    await expect(card(page)).toBeVisible(); // reviewer-found bug: it used to wait for the next tab switch
  });

  test('Send me the link opens the share sheet with this address', async ({ page }) => {
    await openTab(page, 'Program');
    await stubShare(page, { share: true });
    await card(page).getByRole('button', { name: 'Send me the link' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1); // the press is handled asynchronously: wait for it
    const [shared, copied] = await Promise.all([page.evaluate(() => window.__shared), page.evaluate(() => window.__copied)]);
    expect(shared).toHaveLength(1);
    expect(shared[0].url).toBe(new URL('/', page.url()).href);
    expect(shared[0].text).not.toMatch(/price|plan|subscribe|upgrade/i);
    expect(copied).toEqual([]);
  });

  test('with no share sheet the address is copied and the button says so', async ({ page }) => {
    await openTab(page, 'Program');
    await stubShare(page, { share: false });
    await card(page).getByRole('button', { name: 'Send me the link' }).click();
    await expect(card(page).getByRole('button', { name: 'Link copied' })).toBeVisible();
    expect(await page.evaluate(() => window.__copied)).toEqual([new URL('/', page.url()).href]);
  });

  test('Settings keeps the row after the card is dismissed, and it passes the accessibility scan', async ({ page }) => {
    await openTab(page, 'Program');
    await card(page).getByRole('button', { name: 'Not now' }).click();
    await openTab(page, 'Settings');
    await expect(rowHeading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send me the link' })).toBeVisible();
    expect(await scan(page).then(r => r.violations)).toEqual([]);
    const box = await page.getByRole('button', { name: 'Send me the link' }).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('inside the Android app it shows the same card', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(document, 'referrer', { get: () => 'android-app://app.loadbearer' }));
    await page.reload();
    await openTab(page, 'Program');
    await expect(card(page)).toBeVisible();
  });
});

test.describe('on a computer', () => {
  test('neither the card nor the Settings row is shown', async ({ page }) => {
    await openTab(page, 'Program');
    await expect(page.getByRole('heading', { name: 'Program' }).first()).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Send feedback' })).toBeVisible();
    await expect(rowHeading(page)).toHaveCount(0);
  });
});
