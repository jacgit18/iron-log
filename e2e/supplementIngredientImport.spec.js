import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, openSupplementEditor, todayCol, openDayTotals } from './nutritionBoardHelpers.js';

// Brief supplement-active-ingredients, PR 2: the NIH lookup and the bottle scan save omega-3, EPA, DHA, creatine and caffeine as ingredient rows (not "Also on the label"), through the add
// sheet and Fill from label. The mapping and the validator are node tests (dsldLabel.test.ts on real labels, supplementScan.test.ts, supplementLabelFill.test.ts); what a node test cannot catch is the
// wiring: the preview, Add saving the rows, the compare view, Replace and Save, the rows reaching Totals, and axe. Routes are stubbed (no model call); a real bottle is the owner's check.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'bottle.png', mimeType: 'image/png', buffer: PNG };
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
// "Mine": a catalog fish oil you typed one row for (EPA 100 mg is wrong against the label) and a caffeine row the label does not state.
const pull = { rows: [
  { table: 'list_items', list: 'supplement_item', client_id: 'fishy', position: 0, data: { id: 'fishy', n: 'Fish Oil Ultra', slot: 'morning', catalogId: 'c:dsld:75577', ingredients: [{ name: 'EPA', amount: 100, unit: 'mg' }, { name: 'Caffeine', amount: 50, unit: 'mg' }] }, ...rowBase, seq: '1' },
], cursor: '1', more: false };
const fishLabel = { name: 'Ultra Potency Omega-3 Fish Oil', brand: 'Acme', entryYear: 2020, serving: { text: '1 softgel', units: 1, form: 'Softgel' }, rows: [], ingredients: [{ name: 'EPA', amount: 450, unit: 'mg' }, { name: 'DHA', amount: 340, unit: 'mg' }], other: [{ name: 'ArcticPure Fish Oil Concentrate', amount: 1.25, unit: 'Gram(s)' }] };
const panel = { kind: 'ok', label: { name: 'Fish Oil Bottle', serving: { text: '2 softgels', units: 2, form: 'Softgel' }, rows: [], ingredients: [{ name: 'Omega-3', amount: 1000, unit: 'mg' }, { name: 'EPA', amount: 600, unit: 'mg' }, { name: 'DHA', amount: 400, unit: 'mg' }], other: [{ name: 'Fish oil', amount: 2500, unit: 'mg' }] } };

async function open(page) {
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [] }));
  await page.route('**/api/catalog/search?*', route => json(200, { ok: true, items: new URL(route.request().url()).searchParams.get('q').toLowerCase().includes('omega') ? [{ id: 'c:dsld:900', name: 'Omega Ultra', brand: 'Acme', data: { form: 'Softgel', entryYear: 2020 } }] : [], more: false })(route));
  await page.route('**/api/supplement-label/*', json(200, { label: fishLabel }));
  await page.goto('/');
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await openSupplementEditor(page);
}
const sheet = page => page.getByRole('dialog', { name: 'Add a supplement' });

test('an NIH fish oil label previews omega-3 style rows apart from the blend weight, and Add saves them so they reach Totals', async ({ page }) => {
  await open(page);
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('omega ultra');
  await sheet(page).getByRole('button', { name: /^Omega Ultra/ }).click();
  const lbl = sheet(page).locator('.lbl');
  await expect(lbl.locator('.lblrows').first()).toContainText('EPA');
  await expect(lbl.locator('.lblrows').first()).toContainText('450 mg');
  await expect(lbl.locator('.lblrows').first()).toContainText('DHA');
  await expect(lbl.locator('.lblrows').first()).toContainText('340 mg');
  await expect(lbl.locator('.lblmore')).toContainText('Also on the label (1)'); // the blend weight stays here, not in the rows above
  await lbl.locator('.lblmore summary').click();
  await expect(lbl.locator('.lblmore')).toContainText('ArcticPure Fish Oil Concentrate');
  await sheet(page).getByLabel('Morning').check();
  await page.click('#suppadd-go');
  await expect(sheet(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Omega Ultra' }).click();
  await expect(page.getByLabel('Ingredient 1', { exact: true })).toHaveValue('EPA');
  await expect(page.getByLabel('Amount of ingredient 1')).toHaveValue('450');
  await expect(page.getByLabel('Ingredient 2', { exact: true })).toHaveValue('DHA');
  await expect(page.getByLabel('Amount of ingredient 2')).toHaveValue('340');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await closeSupplementEditor(page);
  await todayCol(page).getByLabel('Omega Ultra', { exact: false }).first().check();
  await openDayTotals(todayCol(page));
  await expect(page.getByRole('dialog').locator('#stt-ing-epa')).toContainText('450 mg');
  await expect(page.getByRole('dialog').locator('#stt-ing-dha')).toContainText('340 mg');
});

test('a scanned fish oil bottle previews and saves omega-3, EPA and DHA as three rows, keeps the check note, and the blend weight stays under Also on the label', async ({ page }) => {
  await open(page);
  await page.route('**/api/scan/supplement', json(200, { ok: true, result: panel, left: 4, max: 5 }));
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('Zzyzx fish');
  await expect(sheet(page).getByText('No match.')).toBeVisible();
  await sheet(page).getByLabel('Bottle camera').setInputFiles(photo);
  await expect(sheet(page).getByText('Read from your photo. Check each amount against the bottle.')).toBeVisible();
  const rows = sheet(page).locator('.lblrows').first();
  await expect(rows).toContainText('Omega-3'); await expect(rows).toContainText('1000 mg');
  await expect(rows).toContainText('EPA'); await expect(rows).toContainText('600 mg');
  await expect(rows).toContainText('DHA'); await expect(rows).toContainText('400 mg');
  await expect(sheet(page).locator('.lblmore')).toContainText('Also on the label (1)');
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await sheet(page).getByLabel('Morning').check();
  await page.click('#suppadd-go');
  await page.getByRole('button', { name: 'Edit Zzyzx fish' }).click();
  const names = await page.locator('select[aria-label^="Ingredient "]').evaluateAll(els => els.map(e => e.value));
  expect(names).toEqual(['Omega-3', 'EPA', 'DHA']);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await closeSupplementEditor(page);
  await todayCol(page).getByLabel('Zzyzx fish', { exact: false }).first().check();
  await openDayTotals(todayCol(page));
  await expect(page.getByRole('dialog').locator('#stt-ing-omega-3')).toContainText('1,000 mg'); // the row is the amount in one serving, taken once
});

test('Fill from label compares the ingredient rows, replaces EPA, adds DHA, keeps the caffeine row the label lacks, and nothing changes until Replace then Save', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit Fish Oil Ultra' }).click();
  await expect(page.getByLabel('Amount of ingredient 1')).toHaveValue('100');
  await page.getByRole('button', { name: 'Fill from label' }).click();
  const cmp = page.getByRole('group', { name: 'Label amounts' });
  await expect(cmp.getByRole('row', { name: /^EPA/ })).toContainText('100 mg');
  await expect(cmp.getByRole('row', { name: /^EPA/ })).toContainText('450 mg');
  await expect(cmp.getByRole('row', { name: /^EPA/ })).toContainText('replaced');
  await expect(cmp.getByRole('row', { name: /^DHA/ })).toContainText('new');
  await expect(cmp.getByRole('row', { name: /^Caffeine/ })).toContainText('kept (not on the label)');
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
  await cmp.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Amount of ingredient 1')).toHaveValue('100'); // Cancel changed nothing
  await page.getByRole('button', { name: 'Fill from label' }).click();
  await page.getByRole('button', { name: 'Replace with label amounts' }).click();
  await expect(page.getByText('Label amounts are in the rows above. Press Save to keep them.')).toBeVisible();
  const vals = await page.locator('[aria-label^="Amount of ingredient "]').evaluateAll(els => els.map(e => e.value));
  expect(vals).toEqual(['450', '340', '50']); // EPA, DHA, then the kept caffeine
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Edit Fish Oil Ultra' }).click();
  const saved = await page.locator('[aria-label^="Amount of ingredient "]').evaluateAll(els => els.map(e => e.value));
  expect(saved).toEqual(['450', '340', '50']);
});
