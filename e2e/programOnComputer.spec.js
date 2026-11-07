import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// "Program on a computer" (brief: briefs/program-on-computer, then briefs/program-tab-clarity): the Settings row on touch screens, and the Send me the link button the
// Program tab's guide card shares (its own checks are in programTabClarity.spec.js; the old floating tip is gone). What a unit test cannot catch: the touch-versus-mouse
// decision from the real media query, the real button calling the share sheet or the clipboard. The wording and the rule are unit tests.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
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

  test('Settings shows the row, its button passes the accessibility scan and is 44px tall', async ({ page }) => {
    await openTab(page, 'Settings');
    await expect(rowHeading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send me the link' })).toBeVisible();
    expect(await scan(page).then(r => r.violations)).toEqual([]);
    const box = await page.getByRole('button', { name: 'Send me the link' }).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('Send me the link opens the share sheet with this address', async ({ page }) => {
    await openTab(page, 'Settings');
    await stubShare(page, { share: true });
    await page.getByRole('button', { name: 'Send me the link' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1); // the press is handled asynchronously: wait for it
    const [shared, copied] = await Promise.all([page.evaluate(() => window.__shared), page.evaluate(() => window.__copied)]);
    expect(shared).toHaveLength(1);
    expect(shared[0].url).toBe(new URL('/', page.url()).href);
    expect(shared[0].text).not.toMatch(/price|plan|subscribe|upgrade/i);
    expect(copied).toEqual([]);
  });

  test('with no share sheet the address is copied and the button says so', async ({ page }) => {
    await openTab(page, 'Settings');
    await stubShare(page, { share: false });
    await page.getByRole('button', { name: 'Send me the link' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
    expect(await page.evaluate(() => window.__copied)).toEqual([new URL('/', page.url()).href]);
  });

  test('the Program tab has no floating tip', async ({ page }) => {
    await openTab(page, 'Program');
    await expect(page.getByRole('heading', { name: 'Program' }).first()).toBeVisible();
    await expect(page.locator('#program-computer-hint')).toHaveCount(0);
  });
});

test.describe('on a computer', () => {
  test('the Settings row is not shown', async ({ page }) => {
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Send feedback' })).toBeVisible();
    await expect(rowHeading(page)).toHaveCount(0);
  });
});
