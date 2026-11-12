import { test, expect } from './fixtures.js';

// One empty view (brief design-language-later-slices, slice 5): Progress and Saved programs show the shared EmptyState when there is nothing to show and not when there is.
// The fixture's clock is Thu Sep 24 2026.
const seedLog = page => page.addInitScript(() => {
  if (localStorage.getItem('ironlog:seeded')) return;
  localStorage.setItem('ironlog:seeded', '1');
  localStorage.setItem('ironlog:logs/hack', JSON.stringify({ entries: [{ id: 'h1', d: '2026-09-22', w: 135, s: 3, r: 8, ph: 'hyp' }] }));
});

test('Progress: an empty account shows the shared empty view, one with a log does not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.click('#tab-progress');
  const box = page.locator('#pg-overview .emptystate');
  await expect(box).toContainText('Nothing to chart yet');
  const look = await box.evaluate(el => { const c = getComputedStyle(el); return { style: c.borderTopStyle, radius: c.borderTopLeftRadius, bg: c.backgroundColor }; });
  expect(look.style).toBe('dashed');
  expect(look.radius).toBe('12px'); // --r-xl
  await expect(page.locator('#pg-lifts .emptystate')).toContainText('No sessions logged yet');
});

test('Progress: with a log neither empty view shows', async ({ page }) => {
  await seedLog(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.click('#tab-progress');
  await expect(page.locator('#pg-lifts .pcard')).toHaveCount(1);
  await expect(page.locator('.emptystate')).toHaveCount(0);
});

test('Saved programs: none saved shows the shared empty view, a saved copy replaces it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/program/saved');
  const box = page.locator('.emptystate');
  await expect(box).toContainText('No saved programs yet');
  await page.getByRole('textbox', { name: /^Save Program A as/ }).fill('Old block');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByRole('button', { name: 'Edit Old block' })).toBeVisible();
  await expect(box).toHaveCount(0);
});
