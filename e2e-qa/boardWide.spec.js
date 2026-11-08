import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-37 (Heavy logger): all seven day columns fit a 1920 px screen with no sideways scroll; at 1280 px the Board scrolls sideways again.
test('S-37: the Board fits 1920 px, and scrolls sideways at 1280 px', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'heavy-logger', { viewport: { width: 1920, height: 1080 } });
  const columns = page.locator('.board .col');
  await expect(columns).toHaveCount(7, { timeout: 30_000 });
  const boxes = await columns.evaluateAll(cols => cols.map(c => { const r = c.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
  for (const b of boxes) { expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(1920); }
  const wide = await page.locator('.board').evaluate(b => ({ client: b.clientWidth, scroll: b.scrollWidth }));
  expect(wide.scroll).toBeLessThanOrEqual(wide.client);
  await page.setViewportSize({ width: 1280, height: 900 });
  const narrow = await page.locator('.board').evaluate(b => ({ client: b.clientWidth, scroll: b.scrollWidth }));
  expect(narrow.scroll).toBeGreaterThan(narrow.client);
  await context.close();
});
