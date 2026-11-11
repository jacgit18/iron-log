import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, suppChip, suppRow, todayCol } from './nutritionBoardHelpers.js';

// Brief supplement-merged-list: Manage > Supplements and library is one list, a row per supplement, with Morning, Noon and Night chips on the row. The rules (grouping, filters, counts, which
// store call a chip makes) are node tests (supplementList.test.ts, supplementTimesStore.test.ts); this covers the wiring a node test cannot: the taps, the Undo notice, the Board and the layout.
const add = async (page, name) => {
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(suppRow(page, name)).toHaveCount(1);
};
const lit = (page, name, slot) => expect(suppChip(page, name, slot)).toHaveAttribute('aria-pressed', 'true');
const unlit = (page, name, slot) => expect(suppChip(page, name, slot)).toHaveAttribute('aria-pressed', 'false');

test('one row per supplement; a chip tap adds or removes a time, Undo brings it back, the last one off keeps it in the library', async ({ page }) => {
  await openNutrition(page); await openSupplementEditor(page);
  await add(page, 'Vitamin D3');
  await lit(page, 'Vitamin D3', 'Morning'); // a new supplement starts in the morning
  await suppChip(page, 'Vitamin D3', 'Night').click();
  await lit(page, 'Vitamin D3', 'Night'); await lit(page, 'Vitamin D3', 'Morning');
  await expect(suppRow(page, 'Vitamin D3')).toHaveCount(1); // two times, still one row
  await expect(suppRow(page, 'Vitamin D3')).toContainText('2 a day');
  const dlg = await page.getByRole('dialog').innerText(); // no schedule list repeats the name under each time: it is written once in the whole sheet
  expect(dlg.split('Vitamin D3').length - 1).toBe(1);
  await suppChip(page, 'Vitamin D3', 'Noon').click(); // a third time adds a copy at one serving
  await lit(page, 'Vitamin D3', 'Noon');
  await expect(suppRow(page, 'Vitamin D3')).toContainText('3 a day');
  await suppChip(page, 'Vitamin D3', 'Noon').click();
  await unlit(page, 'Vitamin D3', 'Noon');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await lit(page, 'Vitamin D3', 'Noon');
  await suppChip(page, 'Vitamin D3', 'Noon').click();
  await unlit(page, 'Vitamin D3', 'Noon');
  await suppChip(page, 'Vitamin D3', 'Night').click(); // off, another time stays
  await unlit(page, 'Vitamin D3', 'Night');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await lit(page, 'Vitamin D3', 'Night');
  await suppChip(page, 'Vitamin D3', 'Night').click(); await suppChip(page, 'Vitamin D3', 'Morning').click(); // both off: the last one off
  await unlit(page, 'Vitamin D3', 'Morning'); await unlit(page, 'Vitamin D3', 'Night');
  await expect(suppRow(page, 'Vitamin D3')).toContainText('Library only');
  await expect(page.locator('#suplib-filter-library')).toContainText('1'); // kept, not deleted
  await suppChip(page, 'Vitamin D3', 'Noon').click(); // a library-only supplement moves in
  await lit(page, 'Vitamin D3', 'Noon');
  await expect(page.locator('.exlib .exrow')).toHaveCount(1);
});

test('the filter counts and narrows the list, and a scheduled time shows on the Board', async ({ page }) => {
  await openNutrition(page); await openSupplementEditor(page);
  await add(page, 'Zinc'); await add(page, 'Creatine');
  await suppChip(page, 'Zinc', 'Morning').click(); // off: the only time, so Zinc is now library only
  await unlit(page, 'Zinc', 'Morning');
  await expect(page.locator('#suplib-filter-all')).toContainText('2');
  await expect(page.locator('#suplib-filter-scheduled')).toContainText('1');
  await expect(page.locator('#suplib-filter-library')).toContainText('1');
  await page.locator('#suplib-filter-library').click();
  await expect(page.locator('.exlib .exrow')).toHaveCount(1);
  await expect(suppRow(page, 'Zinc')).toHaveCount(1);
  await page.locator('#suplib-filter-all').click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('creat');
  await expect(page.locator('.exlib .exrow')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search' }).fill('zzzz');
  await expect(page.locator('.exlib .exrow')).toHaveCount(0);
  await expect(page.getByText('No supplement matches. Clear the search or the filters.')).toBeVisible(); // an empty result says so
  await page.getByRole('searchbox', { name: 'Search' }).fill('');
  await suppChip(page, 'Zinc', 'Noon').click();
  await closeSupplementEditor(page);
  await expect(todayCol(page)).toContainText('Zinc');
});

test('Reorder shows the arrows only while it is on, and a move changes the order', async ({ page }) => {
  await openNutrition(page); await openSupplementEditor(page);
  await add(page, 'Alpha'); await add(page, 'Beta');
  await expect(page.getByRole('button', { name: 'Move Beta up' })).toHaveCount(0);
  await page.locator('#suplib-reorder').click();
  await expect(page.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled(); // first in its time of day
  await page.getByRole('button', { name: 'Move Beta up' }).click();
  await expect(page.locator('.exlib .exrow b').first()).toContainText('Beta');
  await page.locator('#suplib-reorder').click();
  await expect(page.getByRole('button', { name: 'Move Beta up' })).toHaveCount(0);
});

for (const [w, h] of [[375, 812], [1920, 1080]]) {
  test(`the list fits a ${w}px screen with its chips reachable`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openNutrition(page); await openSupplementEditor(page);
    await add(page, 'Magnesium glycinate with a long product name');
    const chip = suppChip(page, 'Magnesium glycinate', 'Night');
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
