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

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true')); await page.reload(); });

test('a photo with vitamin lines shows the count in the One-off form and the saved food has them', async ({ page }) => {
  const sheet = await scan(page, LABEL);
  await expect(sheet.locator('#dt-add-k')).toHaveValue('120');
  await expect(line(sheet)).toContainText('Calcium 130 mg, Iron 4.5 mg, Vitamin D 2 mcg, Zinc 1.2 mg'); // each amount named, to check against the label
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await expect(todayCol(page).locator('.nb-eat')).toContainText(['Fortified cereal']);
  const [e] = await stored(page);
  expect(e.micro).toEqual({ calcium: 130, iron: 4.5, vitaminD: 2, zinc: 1.2 });
});

test('Remove drops the amounts and the line, and the food is saved without them', async ({ page }) => {
  const sheet = await scan(page, LABEL);
  await sheet.getByRole('button', { name: 'Remove' }).click();
  await expect(line(sheet)).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.kcal).toBe(120);
  expect('micro' in e).toBe(false);
});

test('changing the calories drops the amounts and the line, because the portion no longer matches the label', async ({ page }) => {
  const sheet = await scan(page, LABEL);
  await sheet.locator('#dt-add-k').fill('240');
  await expect(line(sheet)).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.kcal).toBe(240);
  expect('micro' in e).toBe(false);
});

test('a label with no vitamin lines shows no line and saves as before', async ({ page }) => {
  const sheet = await scan(page, { kind: 'ok', label: { name: 'Rice cake', kcal: 35, p: 1 } });
  await expect(line(sheet)).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  const [e] = await stored(page);
  expect(e.n).toBe('Rice cake');
  expect('micro' in e).toBe(false);
});
