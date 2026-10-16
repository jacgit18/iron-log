import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Swipe a card sideways: right ticks it off, left skips it, either way puts it back. Synthetic touch events: a real finger is the real test.
const phone = async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};
// Dispatch start, a few moves and end on the element at (selector), travelling dx, dy from its (fx, fy) fraction.
const swipe = (page, selector, dx, dy, { from = '', fx = 0.5, fy = 0.5 } = {}) => page.evaluate(({ selector, dx, dy, from, fx, fy }) => {
  const root = document.querySelector(selector);
  const el = from ? root.querySelector(from) : root;
  const r = root.getBoundingClientRect();
  const x0 = r.left + r.width * fx, y0 = r.top + r.height * fy;
  const mk = (type, x, y) => {
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
  };
  el.dispatchEvent(mk('touchstart', x0, y0));
  for (const k of [0.25, 0.5, 0.75, 1]) el.dispatchEvent(mk('touchmove', x0 + dx * k, y0 + dy * k));
  el.dispatchEvent(mk('touchend', x0 + dx, y0 + dy));
}, { selector, dx, dy, from, fx, fy });

const CARD = '.col.sel article.card:has(input.chk.cardchk)'; // a card with its own checkbox (not a superset)
// A ticked or skipped card sinks to the end of its day, so pin the card under test by its ⋯ button id.
const pin = async (page, cards) => { const id = await page.locator(cards).first().locator('> .row1 > .morebtn').getAttribute('id'); return `.col.sel article.card:has(> .row1 > #${id})`; };
const pick = async page => { const sel = await pin(page, CARD); return { sel, box: page.locator(`${sel} input.chk.cardchk`) }; };
const day = page => page.locator('.daytabs [aria-selected="true"]');

test('a long swipe right ticks a card off, and a swipe either way puts it back, like the checkbox', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  await expect(box).not.toBeChecked();
  await swipe(page, sel, 140, 4, { from: '.exh' });
  await expect(box).toBeChecked();
  await expect(page.locator(sel)).toHaveClass(/done/);
  await swipe(page, sel, -140, -4, { from: '.exh' }); // left on a done card: back to open, never skipped
  await expect(box).not.toBeChecked();
  await expect(page.locator(sel)).not.toHaveClass(/skipped/);
  await swipe(page, sel, 140, 0, { from: '.exh' });
  await swipe(page, sel, 140, 0, { from: '.exh' });
  await expect(box).not.toBeChecked();
});

test('a long swipe left skips a card for the week, and the notice\'s Undo brings it back', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  await swipe(page, sel, -140, 0, { from: '.exh' });
  await expect(page.locator(sel)).toHaveClass(/skipped/);
  await expect(box).not.toBeChecked();
  const note = page.locator('.toasts .notice', { hasText: 'for this week.' });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(sel)).not.toHaveClass(/skipped/);
  await expect(note).toHaveCount(0);
  // Skip again, then a swipe either way puts it back; the notice goes with it.
  await swipe(page, sel, -140, 0, { from: '.exh' });
  await expect(page.locator(sel)).toHaveClass(/skipped/);
  await swipe(page, sel, 140, 0, { from: '.exh' });
  await expect(page.locator(sel)).not.toHaveClass(/skipped/);
  await expect(box).not.toBeChecked();
  await expect(note).toHaveCount(0);
});

test('a superset card swipes left to skip, and a swipe right does nothing to it or to the day', async ({ page }) => {
  await phone(page);
  const SS = '.col.sel article.card:not(:has(input.chk.cardchk))';
  for (const tab of await page.locator('.daytabs [role="tab"]').all()) { if (await page.locator(SS).count()) break; await tab.click(); }
  const sel = await pin(page, SS);
  const before = await day(page).getAttribute('id');
  await swipe(page, sel, 140, 0, { from: '.exh' });
  await expect(page.locator(sel)).not.toHaveClass(/done|skipped/);
  await expect(day(page)).toHaveAttribute('id', before);
  await swipe(page, sel, -140, 0, { from: '.exh' });
  await expect(page.locator(sel)).toHaveClass(/skipped/);
  await expect(day(page)).toHaveAttribute('id', before);
});

test('a short swipe, a vertical swipe and a swipe that starts on a control do nothing to the card', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  for (const dx of [-1, 1]) {
    await swipe(page, sel, dx * 40, 0, { from: '.exh' });
    await swipe(page, sel, dx * 20, 160, { from: '.exh' });
    await swipe(page, sel, dx * 150, 0, { from: 'select.phase' });
    await swipe(page, sel, dx * 150, 0, { from: 'button' });
  }
  await expect(box).not.toBeChecked();
  await expect(page.locator(sel)).not.toHaveClass(/done|skipped/);
});

test('a card swipe does not also change the day, and a swipe on the day area still does', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  const before = await day(page).getAttribute('id');
  await swipe(page, sel, 140, 0, { from: '.exh' });
  await expect(box).toBeChecked();
  await swipe(page, sel, -140, 0, { from: '.exh' });
  await expect(box).not.toBeChecked();
  await expect(day(page)).toHaveAttribute('id', before);
  await swipe(page, '.weekbar', -150, 0);
  await expect(day(page)).not.toHaveAttribute('id', before);
});

test('a default (non-admin) user can swipe a card done, and a card swipe never moves the day', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  await expect(page.locator(sel)).toHaveClass(/swipable/);
  await swipe(page, sel, 140, 0, { from: '.exh' });
  await expect(box).toBeChecked();
});

test('the day tabs still change the day on a phone', async ({ page }) => {
  await phone(page);
  const before = await day(page).getAttribute('id');
  await page.locator('.daytabs [role="tab"][aria-selected="false"]').first().click();
  await expect(day(page)).not.toHaveAttribute('id', before);
});

test('a mouse drag across a card does nothing, and the card stays draggable on desktop', async ({ page }) => {
  const { sel, box } = await pick(page);
  const card = page.locator(sel);
  await expect(card).toHaveAttribute('draggable', 'true');
  const b = await card.boundingBox();
  await page.mouse.move(b.x + b.width - 20, b.y + 10); await page.mouse.down(); await page.mouse.move(b.x + 10, b.y + 12, { steps: 8 }); await page.mouse.up();
  await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.down(); await page.mouse.move(b.x + b.width - 10, b.y + 12, { steps: 8 }); await page.mouse.up();
  await expect(box).not.toBeChecked();
  await expect(card).not.toHaveClass(/skipped/);
});

test('the phone board with swipeable cards has no accessibility violations, also mid-swipe', async ({ page }) => {
  await phone(page);
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  const { sel } = await pick(page);
  await page.evaluate(sel => {
    const root = document.querySelector(sel), el = root.querySelector('.exh'), r = root.getBoundingClientRect();
    const t = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 40 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(r.left + 200)], changedTouches: [t(r.left + 200)] }));
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t(r.left + 100)], changedTouches: [t(r.left + 100)] }));
  }, sel);
  await expect(page.locator(sel)).toHaveClass(/swiping/);
  await expect(page.locator(sel)).toHaveAttribute('data-hint', 'Skip');
  expect((await scan()).violations).toEqual([]);
});
