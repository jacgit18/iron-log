import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Swipe a card sideways to tick it off. Synthetic touch events: a real finger is the real test.
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

const CARD = '.col.sel article.card:has(> .row1 > input.chk)'; // a card with its own checkbox (not a superset)
// A ticked card sinks to the end of its day, so pin the card under test by its checkbox id.
const pick = async page => { const id = await page.locator(CARD).first().locator('> .row1 > input.chk').getAttribute('id'); return { id, sel: `.col.sel article.card:has(> .row1 > #${id})`, box: page.locator(`#${id}`) }; };
const day = page => page.locator('.daytabs [aria-selected="true"]');

test('a long sideways swipe on a card ticks it off and a second one undoes it, like the checkbox', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  await expect(box).not.toBeChecked();
  await swipe(page, sel, -140, 4, { from: '.exh' });
  await expect(box).toBeChecked();
  await expect(page.locator(sel)).toHaveClass(/done/);
  await swipe(page, sel, 140, -4, { from: '.exh' });
  await expect(box).not.toBeChecked();
});

test('a short swipe, a vertical swipe and a swipe that starts on a control do nothing to the card', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  await swipe(page, sel, -40, 0, { from: '.exh' });
  await swipe(page, sel, -20, 160, { from: '.exh' });
  await swipe(page, sel, -150, 0, { from: 'select.phase' });
  await swipe(page, sel, -150, 0, { from: 'button' });
  await expect(box).not.toBeChecked();
  await expect(page.locator(sel)).not.toHaveClass(/done/);
});

test('a card swipe does not also change the day, and a swipe on the day area still does', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  const before = await day(page).getAttribute('id');
  await swipe(page, sel, -140, 0, { from: '.exh' });
  await expect(box).toBeChecked();
  await expect(day(page)).toHaveAttribute('id', before);
  await swipe(page, '.weekbar', -150, 0);
  await expect(day(page)).not.toHaveAttribute('id', before);
});

test('a default (non-admin) user can swipe a card done, and a card swipe never moves the day', async ({ page }) => {
  await phone(page);
  const { sel, box } = await pick(page);
  await expect(page.locator(sel)).toHaveClass(/swipable/);
  await swipe(page, sel, -140, 0, { from: '.exh' });
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
  await expect(box).not.toBeChecked();
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
  expect((await scan()).violations).toEqual([]);
});
