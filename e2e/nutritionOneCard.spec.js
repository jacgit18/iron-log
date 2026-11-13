import { test, expect } from './fixtures.js';
import { openNutrition } from './nutritionBoardHelpers.js';

// Nutrition desktop top (brief nutrition-desktop-one-card, owner picked variation A, 2026-11-13): from 700 px one bordered card holds the week row (arrows, dates, Manage at the right end), the seven day tabs below 1440 px, and the add-food toolbar under a hairline. What a unit test cannot catch: where things sit and that nothing overflows; the phone keeps the toolbar outside the card.
const box = (page, sel) => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, h: r.height, w: r.width }; });
const overflows = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.wdc, .wdc *')].some(e => { const r = e.getBoundingClientRect(), c = document.querySelector('.wdc').getBoundingClientRect(); return r.width && (r.right > c.right + 1 || r.left < c.left - 1); }));

for (const [width, tabs] of [[700, 7], [1280, 7], [1920, 0]]) {
  test(`at ${width} px one card holds the week row${tabs ? ', the day tabs' : ''} and the add-food toolbar, in that order, with nothing overflowing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openNutrition(page);
    const card = page.locator('.wdc');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.nb-weeksw')).toBeVisible();
    await expect(card.locator('.nb-weeklab')).toContainText('This week · ');
    await expect(card.locator('#nb-manage')).toBeVisible();
    await expect(card.locator('.nb-toolbar')).toBeVisible();
    await expect(card.locator('.nb-toolbar').getByRole('button', { name: 'Add food', exact: true })).toBeVisible();
    await expect(card.locator('.wdc-tabs [role="tab"]')).toHaveCount(tabs);
    const c = await box(page, '.wdc'), w = await box(page, '.nb-weeksw'), m = await box(page, '#nb-manage'), t = await box(page, '.nb-toolbar'), add = await box(page, '#nb-add');
    expect(Math.abs(w.y - m.y)).toBeLessThan(2); // switcher and Manage share row 1
    expect(m.r).toBeGreaterThan(c.r - 24); // Manage at the right end
    expect(t.y).toBeGreaterThanOrEqual(m.b - 0.5); // toolbar under the week row
    if (tabs) { const tb = await box(page, '.wdc-tabs'); expect(tb.y).toBeGreaterThanOrEqual(m.b - 0.5); expect(t.y).toBeGreaterThanOrEqual(tb.b - 0.5); } // tabs between the two
    const rights = await page.locator('.nb-toolbar .btn').evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
    expect(add.r).toBeGreaterThan(c.r - 24); // Add food is at the right end of its row
    expect(await page.locator('.nb-tbtns .btn').last().getAttribute('id')).toBe('nb-add'); // and the last button
    expect(add.r).toBeGreaterThanOrEqual(Math.max(...rights) - 1);
    expect(t.b).toBeLessThanOrEqual(c.b + 0.5);
    const col = await box(page, '.nb-col');
    expect(col.y).toBeGreaterThanOrEqual(c.b); // the day columns start below the card
    await expect(page.locator('.nb-headbtns')).toHaveCount(0);
    expect(await overflows(page)).toBe(false);
    await page.locator('#nb-manage').click(); // same Manage as before
    await expect(page.getByRole('dialog', { name: 'Manage' })).toBeVisible();
    await page.keyboard.press('Escape');
  });
}

test('a week other than this one adds the This week button to row 1 and still fits the card at 700 px', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await openNutrition(page);
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByRole('button', { name: 'This week', exact: true })).toBeVisible();
  const m = await box(page, '#nb-manage'), c = await box(page, '.wdc');
  expect(m.r).toBeLessThanOrEqual(c.r + 0.5);
  expect(m.r).toBeGreaterThan(c.r - 24);
  expect(await overflows(page)).toBe(false);
});

test('with large text the card still holds the toolbar and nothing overflows at 768 px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await openNutrition(page);
  await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
  await expect(page.locator('.wdc .nb-toolbar')).toBeVisible();
  expect(await overflows(page)).toBe(false);
});

test('on a phone the toolbar stays below the card and the dates stay out of it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openNutrition(page);
  await expect(page.locator('.wdc .nb-toolbar')).toHaveCount(0);
  await expect(page.locator('.wdc .nb-weeklab')).toHaveCount(0);
  await expect(page.locator('.wdc-foot')).toHaveCount(0);
  const c = await box(page, '.wdc'), t = await box(page, '.nb-toolbar');
  expect(t.y).toBeGreaterThanOrEqual(c.b - 0.5);
});
