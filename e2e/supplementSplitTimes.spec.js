import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openNutrition, openSupplementEditor } from './nutritionBoardHelpers.js';

// Brief supplement-split-times: one supplement at several times of day, each with its own amount, set from the sheet's time chips. The plan, the totals line and the store
// action are node tests (supplementTimes.test.ts, supplementTimesStore.test.ts); this covers the wiring a node test cannot: the chips and steppers on the sheet, Save turning them
// into one entry per time on the schedule, and a time turned off.
const group = (page, name) => page.getByRole('group', { name });
const saveSheet = async page => { await page.getByRole('button', { name: 'Save' }).click(); await expect(page.locator('#sched-h')).toBeVisible(); };

async function fishOilTwoSoftgels(page) {
  await openNutrition(page);
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill('Fish oil');
  await page.locator('#supp-serving-units').fill('1');
  await page.locator('#supp-serving-form').selectOption('softgel');
  await page.locator('#supp-portion-more').click();
  await expect(page.locator('#supp-portion-value')).toHaveText('2 softgels');
  await saveSheet(page);
}

test('two softgels in the morning are split into Morning and Night from the chips, each ticked on its own', async ({ page }) => {
  await fishOilTwoSoftgels(page);
  await page.getByRole('button', { name: 'Edit Fish oil' }).click();
  await expect(page.locator('#stimes-chip-morning')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stimes-chip-night')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#stimes-total')).toContainText('2 softgels a day');
  await page.locator('#stimes-chip-night').click();
  await expect(page.locator('#stimes-total')).toContainText('3 softgels a day'); // Morning 2 + Night 1
  await page.locator('#stimes-less-morning').click();
  await expect(page.locator('#stimes-total')).toContainText('2 softgels a day');
  await expect(page.locator('#stimes-total')).toContainText('Morning 1 · Night 1');
  await saveSheet(page);
  await expect(group(page, 'Morning').locator('.srow')).toContainText(['Fish oil']);
  await expect(group(page, 'Night').locator('.srow')).toContainText(['Fish oil']);
  await group(page, 'Night').getByRole('checkbox').check();
  await expect(group(page, 'Morning').getByRole('checkbox')).not.toBeChecked();
});

test('a time turned off is removed with an Undo notice, and the last time cannot be turned off', async ({ page }) => {
  await fishOilTwoSoftgels(page);
  await page.getByRole('button', { name: 'Edit Fish oil' }).click();
  await page.locator('#stimes-chip-night').click();
  await saveSheet(page);
  await page.getByRole('button', { name: 'Edit Fish oil in Night' }).click();
  await page.locator('#stimes-chip-morning').click(); // off
  await expect(page.locator('#stimes-chip-morning')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#stimes-chip-night').click(); // the last one stays on
  await expect(page.locator('#stimes-chip-night')).toHaveAttribute('aria-pressed', 'true');
  await saveSheet(page);
  await expect(group(page, 'Morning').locator('.srow')).toHaveCount(0);
  await expect(group(page, 'Night').locator('.srow')).toContainText(['Fish oil']);
  await expect(page.getByText('Fish oil from Morning')).toBeVisible();
});

test('the time chips sheet has no axe violations (light and dark), does not scroll sideways at 375 px, and its buttons are 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await fishOilTwoSoftgels(page);
  await page.getByRole('button', { name: 'Edit Fish oil' }).click();
  await page.locator('#stimes-chip-night').click();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const id of ['#stimes-chip-night', '#stimes-less-night', '#stimes-more-night']) {
    const box = await page.locator(id).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: 'Cancel' }).click();
});
