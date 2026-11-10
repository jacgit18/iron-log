import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openNutrition, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief supplement-portions: how many capsules you take each time. The maths, words and steps are node tests (supplementPortion.test.ts, supplementPortionTotals.test.ts,
// supplementPortionStore.test.ts); this covers what they cannot: the stepper on the sheet, the amount line, the day's tag, the shared rows of a product in two sections, an old item unchanged,
// phone width and axe. The fixed clock is Thursday 2026-09-24.
const dialog = page => page.getByRole('dialog');
const value = page => page.locator('#supp-portion-value');

async function newSupplement(page, name, { mg, units } = {}) {
  await page.locator('#suplib-add').click(); await page.locator('#suppadd-full').click();
  await page.locator('#supp-name').fill(name);
  if (mg) {
    await page.locator('#supp-add-nutrient').click();
    await page.getByLabel('Nutrient 1').selectOption({ label: 'Magnesium' });
    await page.getByLabel('Amount 1').fill(String(mg));
  }
  if (units) await page.locator('#supp-serving-units').fill(String(units));
}
const saveSheet = async page => { await page.getByRole('button', { name: 'Save' }).click(); await expect(page.locator('#sched-h')).toBeVisible(); };

test('a capsule stepper moves one capsule per tap, shows the amount, and the day and Totals count it', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await newSupplement(page, 'Mag glycinate', { mg: 200, units: 2 });
  await expect(value(page)).toHaveText('2 capsules'); // one label serving
  await expect(page.locator('#supp-portion-sum')).toContainText('200 mg magnesium'); // the row is the amount in ONE serving (2 capsules)
  await page.locator('#supp-portion-less').click();
  await expect(value(page)).toHaveText('1 capsule');
  await expect(page.locator('#supp-portion-sum')).toContainText('100 mg magnesium');
  await page.locator('#supp-portion-more').click();
  await page.locator('#supp-portion-more').click();
  await expect(value(page)).toHaveText('3 capsules');
  await expect(page.locator('#supp-portion-sum')).toContainText('300 mg magnesium');
  await expect(page.locator('#supp-portion-sum')).toContainText('3 × 100 mg per capsule');
  await page.locator('#supp-portion-less').click();
  await page.locator('#supp-portion-less').click();
  await expect(value(page)).toHaveText('1 capsule');
  await saveSheet(page);
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await expect(col.locator('.nb-portion')).toHaveText('1 capsule'); // the day reads the sheet's value
  await col.getByLabel('Mag glycinate', { exact: false }).first().check();
  await col.getByRole('button', { name: 'Totals' }).click();
  await expect(dialog(page).locator('#stt-magnesium')).toContainText('Mag glycinate (1 capsule) 100 mg');
});

test('a product in two sections keeps its own capsules in each and shares its nutrient rows and serving size', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await newSupplement(page, 'Mag glycinate', { mg: 200, units: 2 });
  await saveSheet(page);
  await page.click('#suplib-add');
  await page.fill('#suppadd-q', 'mag');
  await page.getByRole('dialog').getByRole('button', { name: /Mag glycinate/ }).first().click();
  await page.getByRole('dialog').getByLabel('Night').check();
  await page.click('#suppadd-go');
  await page.getByRole('button', { name: 'Edit Mag glycinate in Night' }).click();
  await expect(value(page)).toHaveText('2 capsules'); // a new intake starts at one serving
  await page.locator('#supp-portion-less').click();
  await expect(value(page)).toHaveText('1 capsule');
  await page.getByLabel('Amount 1').fill('300'); // the rows are shared: changing them here changes Morning too
  await saveSheet(page);
  await page.getByRole('button', { name: 'Edit Mag glycinate in Morning' }).click();
  await expect(page.getByLabel('Amount 1')).toHaveValue('300');
  await expect(value(page)).toHaveText('2 capsules'); // its own amount is unchanged
  await expect(page.locator('#supp-serving-units')).toHaveValue('2');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await expect(col.locator('.nb-portion')).toHaveCount(1); // only the Night intake is not one serving
  await col.getByLabel('Mag glycinate', { exact: false }).nth(0).check();
  await col.getByLabel('Mag glycinate', { exact: false }).nth(1).check();
  await col.getByRole('button', { name: 'Totals' }).click();
  await expect(dialog(page).locator('#stt-magnesium')).toContainText('450 mg'); // 300 mg (Morning, 1 serving) + 150 mg (Night, 1 of 2 capsules)
});

test('no serving size counts servings in quarters, and an older supplement is unchanged', async ({ page }) => {
  await openNutrition(page);
  await openSupplementEditor(page);
  await newSupplement(page, 'Plain mag', { mg: 200 });
  await expect(value(page)).toHaveText('1 serving');
  await page.locator('#supp-portion-less').click();
  await expect(value(page)).toHaveText('¾ serving');
  await page.locator('#supp-portion-less').click();
  await page.locator('#supp-portion-less').click();
  await expect(value(page)).toHaveText('¼ serving');
  await page.locator('#supp-portion-less').click();
  await expect(value(page)).toHaveText('¼ serving'); // never below one step
  await expect(page.locator('#supp-portion-sum')).toContainText('200 mg per serving × ¼ = 50 mg');
  await saveSheet(page);
  await newSupplement(page, 'Old style', { mg: 100 }); // left at one serving, as a supplement saved before this change is
  await saveSheet(page);
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await expect(col.locator('.nb-portion')).toHaveText('¼ serving'); // only the changed one is tagged
  await col.getByLabel('Old style', { exact: false }).first().check();
  await col.getByRole('button', { name: 'Totals' }).click();
  await expect(dialog(page).locator('#stt-magnesium')).toContainText('Old style 100 mg');
});

test('the sheet with the stepper has no axe violations (light and dark) and does not scroll sideways at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openNutrition(page);
  await openSupplementEditor(page);
  await newSupplement(page, 'Mag glycinate', { mg: 200, units: 2 });
  await page.locator('#supp-portion-less').click();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await page.locator('#supp-portion-less').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(value(page)).toHaveText('1 capsule');
  await page.getByRole('button', { name: 'Cancel' }).click();
});
