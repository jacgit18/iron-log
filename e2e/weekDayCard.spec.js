import { test, expect } from './fixtures.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// The phone's week and day selectors are one underlined card (brief week-day-joined-tabs). A unit test cannot catch where it sits, that it stays pinned, or that nothing scrolls sideways.
const box = (page, sel) => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.bottom, w: r.width, h: r.height }; });
// The card is pinned by `position: sticky`; an ancestor with its own overflow would stop that, so check the chain on every screen that draws the card.
const pinnable = page => page.locator('.wdc').first().evaluate(e => {
  const blockers = []; for (let n = e.parentElement; n && n !== document.documentElement; n = n.parentElement) { const o = getComputedStyle(n).overflow; if (o !== 'visible') blockers.push(`${n.className || n.tagName}: ${o}`); }
  return { position: getComputedStyle(e).position, blockers };
});
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

for (const w of [320, 375, 430]) {
  test(`phone ${w}: the Board card holds the week row and D1 to D7 under the filter row, Body weight is under it, and it stays pinned`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 812 });
    await page.reload();
    await expect(page.locator('.col.sel article.card').first()).toBeVisible();
    await expect(page.locator('.boardroot > .weekbar')).toHaveCount(0); // no separate week bar above
    await expect(page.locator('.wdc .weeknav')).toBeVisible();
    await expect(page.locator('.wdc-tabs [role="tab"]')).toHaveCount(7);
    const filter = await box(page, '.filterbar'), card = await box(page, '.wdc'), bw = await box(page, '.bwrow');
    expect(card.y).toBeGreaterThanOrEqual(filter.b - 1);
    expect(bw.y).toBeGreaterThanOrEqual(card.b - 1);
    expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
    await page.evaluate(() => window.scrollTo(0, 900)); // past the card, whatever notices sit above it
    const pinned = await box(page, '.wdc');
    expect(pinned.y).toBeLessThan(2);
    await expect(page.locator('.wdc-tabs [role="tab"][aria-selected="true"]')).toBeInViewport();
  });
}

test('phone: the day tabs move with the arrow keys, Home and End, and a tab name starts with its visible text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const tabs = page.locator('.wdc-tabs [role="tab"]');
  await tabs.nth(1).click();
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100); // a key moves the day, a tap also returns to the top, a key does not
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.nth(6)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  for (const t of await tabs.all()) {
    const [name, text] = await Promise.all([t.getAttribute('aria-label'), t.evaluate(e => e.textContent.trim().replace(/\s+/g, ' '))]);
    expect(name.startsWith(text.split(' ')[0])).toBe(true);
    expect((await t.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  }
});

test('phone: the Stretches card has Sun to Sat with counts, no progress line, and the week row on one line', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.click('#board-stretches');
  const tabs = page.locator('.wdc-tabs [role="tab"]');
  await expect(tabs).toHaveCount(7);
  await expect(tabs.first().locator('b')).toHaveText('Sun');
  await expect(tabs.last().locator('b')).toHaveText('Sat');
  await expect(page.locator('.strroot .progress')).toHaveCount(0);
  const h = await page.locator('.wdc .weeknav h2').evaluate(e => e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
  expect(Math.round(h)).toBe(1);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  expect(await pinnable(page)).toEqual({ position: 'sticky', blockers: [] });
});

test('phone: Nutrition has the week row and seven tabs in one card, Manage at the right end of its row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openNutrition(page);
  await expect(page.locator('.wdc-tabs [role="tab"]')).toHaveCount(7);
  const m = await box(page, '#nb-manage');
  expect(m.x + m.w).toBeGreaterThan(375 - 20);
  expect(await pinnable(page)).toEqual({ position: 'sticky', blockers: [] });
});

test('above 700 px the Board and Stretches keep their own week bars; Nutrition draws the card up to 1439 px and not from 1440 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.locator('.boardroot > .weekbar')).toBeVisible();
  await expect(page.locator('.wdc')).toHaveCount(0);
  await page.click('#board-stretches');
  await expect(page.locator('.strroot > .weekbar')).toBeVisible();
  await expect(page.locator('.wdc')).toHaveCount(0);
  await openNutrition(page);
  await expect(page.locator('.wdc .wdc-tabs [role="tab"]')).toHaveCount(7);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.wdc')).toHaveCount(0);
  await expect(page.locator('.nb-weeksw')).toBeVisible();
});

test('phone: notices stay above the filter row and the card on the Board', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const notice = page.locator('.boardroot > .notice').first();
  if (!(await notice.count())) test.skip(true, 'no notice shows for this fixture');
  const n = await box(page, '.boardroot > .notice'), f = await box(page, '.filterbar'), c = await box(page, '.wdc');
  expect(n.b).toBeLessThanOrEqual(f.y + 1);
  expect(f.b).toBeLessThanOrEqual(c.y + 1);
});
