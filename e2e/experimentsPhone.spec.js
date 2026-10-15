import { test, expect, seedExperiments } from './fixtures.js';

// Experiments on a phone: the strip snaps, the next card still peeks past the edge (so it reads as scrollable), every button is a
// 44px target, and the page does not scroll sideways. (Where the buttons wrap depends on the font, so that is not asserted.)
test('the Experiments strip snaps and peeks, its buttons are 44px and the page stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await seedExperiments(page, ['hack', 'facepull']);
  await page.goto('/');
  const cards = page.locator('.explist .expcard');
  await expect(cards).toHaveCount(2);
  await cards.first().scrollIntoViewIfNeeded();
  const a = await cards.nth(0).boundingBox(); const b = await cards.nth(1).boundingBox();
  expect(b.x).toBeGreaterThan(a.x + a.width - 1); // side by side
  expect(b.x).toBeLessThan(375); // the second card starts inside the screen
  expect(b.x + b.width).toBeGreaterThan(375); // and runs past it, so the strip reads as scrollable
  for (const btn of await cards.first().locator('.actions .btn, .actions select').all()) {
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  const snap = await cards.first().evaluate(el => [getComputedStyle(el).scrollSnapAlign, getComputedStyle(el.parentElement).scrollSnapType]);
  expect(snap[0]).toBe('start'); expect(snap[1]).toMatch(/^x/); // computed, proximity is the default and prints as plain x
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('the Stretches Experiments strip is the same on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.click('#board-stretches');
  for (const n of ['Frog Stretch', 'Cossack Squat']) {
    await page.click('#sexp-add');
    await page.fill('#sexp-name', n);
    await page.keyboard.press('Enter');
  }
  const cards = page.locator('.explist .expcard');
  await expect(cards).toHaveCount(2);
  await cards.first().scrollIntoViewIfNeeded();
  const b = await cards.nth(1).boundingBox();
  expect(b.x).toBeLessThan(375);
  expect(b.x + b.width).toBeGreaterThan(375);
  for (const btn of await cards.first().locator('.actions .btn, .actions select').all()) {
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  const snap = await cards.first().evaluate(el => [getComputedStyle(el).scrollSnapAlign, getComputedStyle(el.parentElement).scrollSnapType]);
  expect(snap[0]).toBe('start'); expect(snap[1]).toMatch(/^x/); // computed, proximity is the default and prints as plain x
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
