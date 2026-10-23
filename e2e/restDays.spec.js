import { test, expect } from './fixtures.js';

// The fixed clock is Thursday 2026-09-24 (week of Sunday 09-20), so Day 5 is today. Day 3 (Tuesday) is a day the lifter skipped.
const DAY3 = ['A-sled3', ...Array.from({ length: 9 }, (_, i) => `A-d3s${i + 1}`)];
const seedWeek = (page, week) => page.addInitScript(w => { localStorage.setItem('ironlog:weeks/2026-09-20', JSON.stringify(w)); }, week);
const dateOf = (page, d) => page.locator(`#restdate-${d}`).innerText();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('a rest on an empty earlier day takes its place: nothing moves and no message', async ({ page }) => {
  await seedWeek(page, { skipped: Object.fromEntries(DAY3.map(id => [id, true])) });
  await page.reload();
  page.on('dialog', d => { throw new Error('unexpected dialog: ' + d.message()); });
  await page.locator('#rest-5').check();
  await expect(page.locator('#col-6 #chk-A-d5s1')).toHaveCount(1);
  await expect(page.locator('#col-7 #chk-A-d6s1')).toHaveCount(1);
  await page.locator('#rest-3').check();
  await expect(page.locator('#rest-3')).toBeChecked();
  await expect(page.locator('#rest-5')).toBeChecked();
  await expect(page.locator('#col-4 #chk-A-d4s1')).toHaveCount(1);
  await expect(page.locator('#col-6 #chk-A-d5s1')).toHaveCount(1); // every other workout keeps its column
  await expect(page.locator('#col-7 #chk-A-d6s1')).toHaveCount(1);
  expect(await dateOf(page, 3)).toMatch(/Tuesday\s+09\/22/);
  expect(await dateOf(page, 5)).toMatch(/Thursday\s+09\/24/);
  await page.locator('#rest-3').uncheck(); // untick: only that date goes, and Day 3 is back in column 3
  await expect(page.locator('#restdate-3')).toHaveCount(0);
  await expect(page.locator('#restdate-5')).toHaveCount(1);
  await expect(page.locator('#col-3 #chk-A-d3s1')).toHaveCount(1);
});

test('one workout that no longer fits is skipped with a message; two ask first', async ({ page }) => {
  await page.locator('#rest-1').check();
  await page.locator('#rest-2').check(); // pushes the Day 6 workout off the week
  await expect(page.getByText(/Day 2 is a rest day now/)).toBeVisible();
  await expect(page.locator('#rest-2')).toBeChecked();
  await page.locator('#rest-2').uncheck();
  await page.locator('#rest-1').uncheck();

  await seedWeek(page, { rest: [1], moved: { 'A-d3s1': 7 } });
  await page.reload();
  let asked = '';
  page.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await page.locator('#rest-2').click(); // check() would fail: Cancel leaves the box unticked
  expect(asked).toMatch(/no room for 2 workouts/);
  await expect(page.locator('#rest-2')).not.toBeChecked(); // Cancel changes nothing
  page.once('dialog', d => d.accept());
  await page.locator('#rest-2').click();
  await expect(page.locator('#rest-2')).toBeChecked();
});

test('the date of a rest day is changed in a sheet; workout days have no date button', async ({ page }) => {
  await page.locator('#rest-3').check();
  await expect(page.locator('.col:not(.rest) .daydate button')).toHaveCount(0);
  const btn = page.locator('#restdate-3');
  const box = await btn.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  await btn.click();
  const sheet = page.getByRole('dialog', { name: 'Rest date, Day 3' });
  await expect(sheet).toBeVisible();
  const chips = sheet.locator('.restdate-chip');
  await expect(chips).toHaveCount(7);
  for (const c of await chips.all()) expect((await c.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(chips.nth(5)).toBeDisabled(); // Friday has not come yet
  await expect(chips.nth(6)).toBeDisabled();
  await chips.nth(1).click(); // Monday
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(btn).toBeFocused(); // focus returns to the date
  expect(await dateOf(page, 3)).toMatch(/Thursday|Tuesday|Wednesday/); // unchanged
  const before = await dateOf(page, 3);
  await btn.click();
  await page.getByRole('dialog', { name: 'Rest date, Day 3' }).locator('.restdate-chip').nth(1).click();
  await page.getByRole('button', { name: 'Save date' }).click();
  expect(await dateOf(page, 3)).toMatch(/Monday\s+09\/21/);
  expect(before).not.toMatch(/Monday/);
});
