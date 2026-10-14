import { test, expect } from './fixtures.js';

// Swipe a stretch group card: right ticks the whole group, either way puts a done group back, left on an open one does nothing
// (skipping is per day). Synthetic touch events: a real finger is the real test.
const swipe = (page, selector, dx, dy = 0) => page.evaluate(({ selector, dx, dy }) => {
  const el = document.querySelector(selector);
  const r = el.getBoundingClientRect();
  const x0 = r.left + r.width * 0.5, y0 = r.top + r.height * 0.5;
  const mk = (type, x, y) => {
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
  };
  el.dispatchEvent(mk('touchstart', x0, y0));
  for (const k of [0.25, 0.5, 0.75, 1]) el.dispatchEvent(mk('touchmove', x0 + dx * k, y0 + dy * k));
  el.dispatchEvent(mk('touchend', x0 + dx, y0 + dy));
}, { selector, dx, dy });

const open = async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: 'Stretches', exact: true }).click().catch(() => page.getByText('Stretches', { exact: true }).first().click());
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
  const label = await page.locator('.col.sel article.card').first().getAttribute('aria-label');
  return { sel: `.col.sel article.card[aria-label="${label}"]`, boxes: page.locator(`.col.sel article.card[aria-label="${label}"] input.chk`) };
};

test('a swipe right ticks a whole stretch group, and a swipe either way puts it back', async ({ page }) => {
  const { sel, boxes } = await open(page);
  const n = await boxes.count();
  await swipe(page, sel, 140);
  for (let i = 0; i < n; i++) await expect(boxes.nth(i)).toBeChecked();
  await expect(page.locator(sel)).toHaveClass(/done/);
  await swipe(page, sel, -140);
  for (let i = 0; i < n; i++) await expect(boxes.nth(i)).not.toBeChecked();
  await swipe(page, sel, 140);
  await swipe(page, sel, 140);
  await expect(boxes.first()).not.toBeChecked();
});

test('a swipe left on an open stretch group does nothing, and short or vertical swipes do nothing', async ({ page }) => {
  const { sel, boxes } = await open(page);
  await swipe(page, sel, -140);
  await swipe(page, sel, 40);
  await swipe(page, sel, 20, 160);
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await expect(boxes.nth(i)).not.toBeChecked();
  await expect(page.locator(sel)).not.toHaveClass(/done|skipped/);
});
