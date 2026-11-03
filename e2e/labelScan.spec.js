import { test, expect } from './fixtures.js';

// Scan label on a new ready-made food (brief label-photo-scan). The validator, the route and the photo sizing are node tests (scan.test.ts, server/scan.test.ts,
// scanPhoto.test.ts); this covers the wiring a unit test cannot: the button only for an admin, a photo filling the real form without saving, and a failure
// leaving the form usable. The route is stubbed: no photo leaves the test.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'label.png', mimeType: 'image/png', buffer: PNG };
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const openForm = async page => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New ready-made food' }).click();
};
const answer = (page, status, body) => page.route('**/api/scan/label', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => { await asAdmin(page); await page.reload(); });

  test('a photo fills the form, the person checks it, and nothing is saved until Save', async ({ page }) => {
    await answer(page, 200, { ok: true, result: { kind: 'ok', label: { name: 'Gnocchi', serving: '1 cup', servingG: 140, servingsPerPack: 3, kcal: 210, p: 6, c: 40, f: 1 } } });
    await openForm(page);
    await page.getByLabel('Label photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'Filled from the photo' })).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Gnocchi');
    await expect(page.getByLabel('Calories per serving')).toHaveValue('210');
    await expect(page.getByLabel('Protein per serving (g)')).toHaveValue('6');
    await expect(page.getByLabel('Carbs per serving (g), optional')).toHaveValue('40');
    await expect(page.getByLabel('Fat per serving (g), optional')).toHaveValue('1');
    await expect(page.getByLabel('Note')).toHaveValue('1 serving = 1 cup (140 g).');
    await expect(page.getByLabel('Servings per pack, optional')).toHaveValue('3');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Ready-made' }).click();
    await expect(page.getByRole('button', { name: /Gnocchi/ })).toHaveCount(0); // cancelled: nothing was saved
  });

  test('Scan label opens the camera and Choose photo opens the library, and either fills the form', async ({ page }) => {
    await answer(page, 200, { ok: true, result: { kind: 'ok', label: { kcal: 95, p: 3 } } });
    await openForm(page);
    await expect(page.getByLabel('Label camera')).toHaveAttribute('capture', 'environment');
    await expect(page.getByLabel('Label photo')).not.toHaveAttribute('capture');
    await page.getByLabel('Label camera').setInputFiles(photo);
    await expect(page.getByLabel('Calories per serving')).toHaveValue('95');
    await page.getByLabel('Calories per serving').fill('');
    await page.getByLabel('Label photo').setInputFiles(photo);
    await expect(page.getByLabel('Calories per serving')).toHaveValue('95');
  });

  test('an unreadable label and a failed call leave the form empty and usable', async ({ page }) => {
    await answer(page, 200, { ok: true, result: { kind: 'unreadable' } });
    await openForm(page);
    await page.getByLabel('Label photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'Could not read' })).toBeVisible();
    await expect(page.getByLabel('Calories per serving')).toHaveValue('');
    await page.unroute('**/api/scan/label');
    await answer(page, 503, { ok: false, error: 'label scan is not available right now', why: 'cap' });
    await page.getByLabel('Label photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'Scan is not available right now' })).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Typed instead');
    await page.getByLabel('Calories per serving').fill('100');
    await page.getByLabel('Protein per serving (g)').fill('5');
    await page.getByRole('button', { name: 'Save food' }).click();
    await expect(page.getByRole('heading', { name: /Typed instead/ })).toBeVisible();
  });

  test('the button is not on a saved food being edited', async ({ page }) => {
    await openForm(page);
    await page.getByLabel('Name', { exact: true }).fill('Frozen lasagna');
    await page.getByLabel('Calories per serving').fill('420');
    await page.getByLabel('Protein per serving (g)').fill('22');
    await page.getByRole('button', { name: 'Save food' }).click();
    await page.getByRole('button', { name: /Edit/ }).first().click();
    await expect(page.getByRole('button', { name: 'Scan label' })).toHaveCount(0);
  });
});

test('a person who is not an admin sees no Scan label button', async ({ page }) => {
  await openForm(page);
  await expect(page.getByRole('button', { name: 'Save food' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan label' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose photo' })).toHaveCount(0);
});
