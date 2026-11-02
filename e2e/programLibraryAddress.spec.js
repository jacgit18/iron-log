import { test, expect } from './fixtures.js';

// A library program has no address of its own (an id never goes in one), so opening one must not leave #/program/a or #/program/b in the bar: a reload would open
// that program instead. Both ways in are covered: the Edit button, and the create sheet's "Not yet", which opens the program while the sheet (and its history entry) is still up.
const hash = page => page.evaluate(() => location.hash);
const title = page => page.locator('#ed-title');
const openPrograms = async page => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await expect.poll(() => hash(page)).toMatch(/^#\/program\/[ab]$/);
};

test('Edit on a library program leaves #/program/a, and picking A again brings it back', async ({ page }) => {
  await openPrograms(page);
  await page.getByRole('textbox', { name: /^Save Program A as/ }).fill('Old block');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await page.getByRole('button', { name: 'Edit Old block' }).click();
  await expect.poll(() => hash(page)).toBe('#/program');
  await expect(title(page)).toContainText('Old block');
  await page.getByRole('group', { name: 'Program to edit' }).getByRole('button').first().click();
  await expect.poll(() => hash(page)).toBe('#/program/a');
});

test('Not yet on a new program opens it in the editor and leaves the A or B address, with no Back step into the old one', async ({ page }) => {
  await openPrograms(page);
  const before = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Create a program' }).click();
  await page.getByLabel('Name').fill('Fresh start');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Not yet/ }).click();
  await expect(title(page)).toContainText('Fresh start');
  await expect.poll(() => hash(page)).toBe('#/program');
  await page.waitForTimeout(300);
  await expect(title(page)).toContainText('Fresh start');
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(before + 1);
});

test('an edited address still opens program B while a library program is open', async ({ page }) => {
  await openPrograms(page);
  await page.getByRole('textbox', { name: /^Save Program A as/ }).fill('Old block');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await page.getByRole('button', { name: 'Edit Old block' }).click();
  await expect(title(page)).toContainText('Old block');
  await page.evaluate(() => { location.hash = '#/program/b'; });
  await expect(page.getByRole('group', { name: 'Program to edit' }).getByRole('button').nth(1)).toHaveAttribute('aria-pressed', 'true');
});
