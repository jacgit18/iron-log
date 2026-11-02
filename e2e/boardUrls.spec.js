import { test, expect } from './fixtures.js';

// Board, Daily Nutrition and Program addresses (follow-up to navigation-urls, 2026-10-31): #/board/workout and #/board/stretches, #/daily/nutrition, #/program/a and #/program/b. The table and parser are node tests (route.test.ts);
// this checks the wiring: the buttons swap the address without adding a Back step, a reload keeps the section, and an edited address changes it.
const hash = page => page.evaluate(() => location.hash);

test('the Board opens on #/board/workout, and Stretches and Workout swap the address', async ({ page }) => {
  await expect.poll(() => hash(page)).toBe('#/board/workout');
  await page.click('#board-stretches');
  await expect.poll(() => hash(page)).toBe('#/board/stretches');
  await expect(page.locator('#board-stretches')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#board-workout');
  await expect.poll(() => hash(page)).toBe('#/board/workout');
  await expect(page.locator('#board-workout')).toHaveAttribute('aria-pressed', 'true');
});

test('a reload and an edited address keep the section, and switching adds no Back step', async ({ page }) => {
  await page.click('#board-stretches');
  await expect.poll(() => hash(page)).toBe('#/board/stretches');
  await page.reload();
  await expect(page.locator('#board-stretches')).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe('#/board/stretches');
  await page.evaluate(() => { location.hash = '#/board/workout'; });
  await expect(page.locator('#board-workout')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => history.length);
  await page.click('#board-stretches');
  await page.click('#board-workout');
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('coming back to the Board tab shows the section you left it on, with its address', async ({ page }) => {
  await page.click('#board-stretches');
  await page.click('#tab-progress');
  await expect.poll(() => hash(page)).toBe('#/progress');
  await page.click('#tab-board');
  await expect.poll(() => hash(page)).toBe('#/board/stretches');
  await expect(page.locator('#board-stretches')).toHaveAttribute('aria-pressed', 'true');
});

test('the Nutrition section is #/daily/nutrition, and the old #/daily/supplements still opens it', async ({ page }) => {
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await expect.poll(() => hash(page)).toBe('#/daily/nutrition');
  await page.click('#daily-grocery');
  await expect.poll(() => hash(page)).toMatch(/^#\/daily\/grocery/);
  await page.evaluate(() => { location.hash = '#/daily/supplements'; });
  await expect(page.locator('#daily-supplements')).toHaveAttribute('aria-pressed', 'true');
});

test('picking Program A or B changes the address with no Back step, a reload keeps it, and an edited address opens that program', async ({ page }) => {
  await page.click('#tab-program');
  const group = page.getByRole('group', { name: 'Program to edit' });
  await expect.poll(() => hash(page)).toMatch(/^#\/program\/[ab]$/);
  const first = (await hash(page)).slice(-1);
  const other = first === 'a' ? 'b' : 'a';
  const before = await page.evaluate(() => history.length);
  await group.getByRole('button').nth(other === 'a' ? 0 : 1).click();
  await expect.poll(() => hash(page)).toBe(`#/program/${other}`);
  expect(await page.evaluate(() => history.length)).toBe(before);
  await page.reload();
  await expect(group.getByRole('button').nth(other === 'a' ? 0 : 1)).toHaveAttribute('aria-pressed', 'true');
  expect(await hash(page)).toBe(`#/program/${other}`);
  await page.evaluate(f => { location.hash = `#/program/${f}`; }, first);
  await expect(group.getByRole('button').nth(first === 'a' ? 0 : 1)).toHaveAttribute('aria-pressed', 'true');
});
