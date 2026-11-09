import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief food-vitamins-minerals, PR C: the label photo also fills the vitamin and mineral lines into the One-off food form. The validator, the prompt and the form-fill rules are node tests
// (scan.test.ts, server/scan.test.ts, labelFill.test.ts); this covers what they cannot: the photo through the real Add food sheet into the form's line, Remove, the calories rule and the
// saved log. The scan route is stubbed: no photo leaves the test.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'label.png', mimeType: 'image/png', buffer: PNG };
const LABEL = { kind: 'ok', label: { name: 'Fortified cereal', kcal: 120, p: 3, c: 26, f: 1, micro: { iron: 4.5, vitaminD: 2, calcium: 130, zinc: 1.2 } } };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const scan = async (page, result) => {
  await page.route('**/api/scan/label', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) }));
  await openNutrition(page);
  const sheet = await openAdd(page, 'Find food');
  await sheet.getByLabel('Label camera').setInputFiles(photo);
  await sheet.getByRole('button', { name: 'Use', exact: true }).click(); // the AI preview, then the One-off form
  return sheet;
};
const line = sheet => sheet.getByText(/Vitamins and minerals read from the photo/);
const asAdmin = async page => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); };

// Admins (the Totals feature) see the amounts as rows (brief type-food-amounts) in place of the line; everyone else keeps the line and its Remove button, tested last.
test.describe('admin: rows', () => {
test.beforeEach(async ({ page }) => asAdmin(page));

test('a photo with vitamin lines shows the count in the One-off form and the saved food has them', async ({ page }) => {
  const sheet = await scan(page, LABEL);
  await expect(sheet.locator('#dt-add-k')).toHaveValue('120');
  for (const [i, v] of ['130', '4.5', '2', '1.2'].entries()) await expect(sheet.getByLabel(`Amount ${i + 1}`)).toHaveValue(v); // calcium, iron, vitamin D, zinc: each amount a row, to check against the label
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await expect(todayCol(page).locator('.nb-eat')).toContainText(['Fortified cereal']);
  const [e] = await stored(page);
  expect(e.micro).toEqual({ calcium: 130, iron: 4.5, vitaminD: 2, zinc: 1.2 });
});

test('removing every row drops the amounts, and the food is saved without them', async ({ page }) => {
  const sheet = await scan(page, LABEL);
  for (const n of ['Calcium', 'Iron', 'Vitamin D', 'Zinc']) await sheet.getByRole('button', { name: `Remove ${n} row` }).click();
  await expect(sheet.getByLabel('Amount 1')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.kcal).toBe(120);
  expect('micro' in e).toBe(false);
});

test('changing the calories drops the rows, because the portion no longer matches the label', async ({ page }) => {
  const sheet = await scan(page, LABEL);
  await sheet.locator('#dt-add-k').fill('240');
  await expect(sheet.getByLabel('Amount 1')).toHaveCount(0);
  await expect(sheet.getByText('Calories changed: amounts you did not retype were cleared.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.kcal).toBe(240);
  expect('micro' in e).toBe(false);
});

test('a label with no vitamin lines shows no rows and saves as before', async ({ page }) => {
  const sheet = await scan(page, { kind: 'ok', label: { name: 'Rice cake', kcal: 35, p: 1 } });
  await expect(sheet.getByLabel('Amount 1')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.n).toBe('Rice cake');
  expect('micro' in e).toBe(false);
});
});

test.describe('everyone else: the line', () => {
  test('a photo with vitamin lines shows the line with each amount, Remove drops it, and the food is saved without them', async ({ page }) => {
    const sheet = await scan(page, LABEL);
    await expect(sheet.getByRole('button', { name: /Vitamins and minerals/ })).toHaveCount(0);
    await expect(line(sheet)).toContainText('Calcium 130 mg, Iron 4.5 mg, Vitamin D 2 mcg, Zinc 1.2 mg');
    await sheet.getByRole('button', { name: 'Remove' }).click();
    await expect(line(sheet)).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await closeSheet(page);
    expect('micro' in (await stored(page))[0]).toBe(false);
  });
});
