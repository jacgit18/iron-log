import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { closeSupplementEditor, expectScheduledAt, openSupplementEditor, todayCol } from './nutritionBoardHelpers.js';

// Brief supplement-label-scan: Scan the bottle's label on the add sheet (a miss, or Add as new) and Scan label on a supplement you typed. The validator, the route, the allowance and the messages are
// node tests (supplementScan.test.ts, scan.test.ts, supplementAllowance.test.ts, scanPhoto.test.ts); what a node test cannot catch is the wiring: the camera input, the preview before Add, the amounts
// reaching Totals, the compare view on the supplement sheet, a failure that leaves the sheet usable, and axe. The route is stubbed (no model call); a real bottle and a real phone camera are the owner's check.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'bottle.png', mimeType: 'image/png', buffer: PNG };
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
const pull = { rows: [
  { table: 'list_items', list: 'supplement_item', client_id: 'zinc', position: 0, data: { id: 'zinc', n: 'My Zinc', slot: 'morning', nutrients: [{ key: 'zinc', amount: 8, unit: 'mg' }, { key: 'iron', amount: 5, unit: 'mg' }] }, ...rowBase, seq: '1' },
], cursor: '1', more: false };
const panel = { kind: 'ok', label: { name: 'D3 Drops', brand: 'Sunny', serving: { text: '2 softgels', units: 2, form: 'Softgel' }, rows: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'zinc', amount: 15, unit: 'mg' }], other: [{ name: 'Olive oil' }] } };
const scanAnswer = (result = panel, left = 4) => json(200, { ok: true, result, left, max: 5 });

async function open(page) {
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [] }));
  await page.route('**/api/catalog/search?*', json(200, { ok: true, items: [], more: false }));
  await page.goto('/');
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await openSupplementEditor(page);
}
const sheet = page => page.getByRole('dialog', { name: 'Add a supplement' });
const startMiss = async (page, name = 'Zzyzx drops') => {
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill(name);
  await expect(sheet(page).getByText('No match.')).toBeVisible();
};

test('a miss offers Scan the bottle’s label, shows what was read before Add, and Add saves the amounts that reach Totals', async ({ page }) => {
  await open(page);
  await page.route('**/api/scan/supplement', scanAnswer());
  await startMiss(page);
  await expect(sheet(page).getByText('Uses AI')).toBeVisible();
  await sheet(page).getByLabel('Bottle camera').setInputFiles(photo);
  await expect(sheet(page).getByText('Read from your photo. Check each amount against the bottle.')).toBeVisible();
  await expect(sheet(page).locator('.lblrows').first()).toContainText('50 mcg');
  await expect(sheet(page).getByText('Serving: 2 softgels')).toBeVisible();
  await expect(sheet(page).getByText('Uses AI · 4 of 5 left today')).toBeVisible();
  await sheet(page).getByLabel('Morning').check();
  await page.click('#suppadd-go');
  await expect(sheet(page)).toHaveCount(0);
  await expectScheduledAt(page, 'Morning', ['My Zinc', 'Zzyzx drops']);
  await page.getByRole('button', { name: 'Edit Zzyzx drops' }).click();
  await expect(page.getByLabel('Amount 1')).toHaveValue('50'); // vitamin D, in the app's nutrient order
  await expect(page.getByLabel('Amount 2')).toHaveValue('15'); // zinc
  await page.getByRole('button', { name: 'Cancel' }).click();
  await closeSupplementEditor(page);
  const col = todayCol(page);
  await col.getByLabel('Zzyzx drops', { exact: false }).first().check();
  await col.getByRole('button', { name: 'Totals' }).click();
  await expect(page.getByRole('dialog').locator('#stt-vitaminD')).toContainText('50 mcg');
});

test('a photo that cannot be read leaves the sheet usable, and Add still adds without amounts', async ({ page }) => {
  await open(page);
  await page.route('**/api/scan/supplement', scanAnswer({ kind: 'unreadable' }));
  await startMiss(page);
  await sheet(page).getByLabel('Bottle camera').setInputFiles(photo);
  await expect(sheet(page).getByText('Could not read the amounts. Try a closer, flatter photo, or type them in the supplement’s sheet.')).toBeVisible();
  await expect(sheet(page).locator('.lblrows')).toHaveCount(0);
  await page.click('#suppadd-go');
  await expectScheduledAt(page, 'Morning', ['My Zinc', 'Zzyzx drops']);
});

test('a used-up cap switches the button off and says what to do instead', async ({ page }) => {
  await open(page);
  await page.route('**/api/scan/supplement', json(503, { ok: false, why: 'cap', retryAfterSec: 3600 }));
  await startMiss(page);
  await sheet(page).getByLabel('Bottle camera').setInputFiles(photo);
  await expect(sheet(page).getByText('Bottle scans are used up for today. Type the amounts instead.')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Scan the bottle’s label' })).toBeDisabled();
});

test('a catalog pick never shows the bottle scan', async ({ page }) => {
  await open(page);
  await page.route('**/api/catalog/search?*', json(200, { ok: true, items: [{ id: 'c:dsld:900', name: 'Mega Men', brand: 'Nature Made', data: { form: 'Tablet', entryYear: 2020 } }], more: false }));
  await page.route('**/api/supplement-label/*', json(200, { label: { name: 'Mega Men', serving: null, rows: [], other: [] } }));
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('mega men');
  await sheet(page).getByRole('button', { name: /^Mega Men/ }).click();
  await expect(sheet(page).getByRole('button', { name: /Scan the bottle/ })).toHaveCount(0);
});

test('Scan label on a supplement you typed shows its rows beside the scanned ones, and changes nothing until Replace', async ({ page }) => {
  await open(page);
  await page.route('**/api/scan/supplement', scanAnswer());
  await page.getByRole('button', { name: 'Edit My Zinc' }).click();
  await expect(page.getByLabel('Amount 1')).toHaveValue('8');
  await page.getByRole('button', { name: 'Scan label' }).click({ trial: true });
  await page.getByLabel('Bottle camera').setInputFiles(photo);
  const cmp = page.getByRole('group', { name: 'Label amounts' });
  await expect(cmp).toContainText('Zinc');
  await expect(cmp).toContainText('8 mg');
  await expect(cmp).toContainText('15 mg');
  await expect(cmp).toContainText('kept (not on the label)'); // iron, typed, not on the scan
  await cmp.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Amount 1')).toHaveValue('8'); // Cancel changed nothing
  await page.getByLabel('Bottle camera').setInputFiles(photo);
  await page.getByRole('button', { name: 'Replace with label amounts' }).click();
  await expect(page.getByText('Label amounts are in the rows above. Press Save to keep them.')).toBeVisible();
  const values = await page.locator('[aria-label^="Amount "]').evaluateAll(els => els.map(e => e.value));
  expect(values.sort()).toEqual(['15', '5', '50']);
});

test('the add sheet with a bottle read has no accessibility violations', async ({ page }) => {
  await open(page);
  await page.route('**/api/scan/supplement', scanAnswer());
  await startMiss(page);
  await sheet(page).getByLabel('Bottle camera').setInputFiles(photo);
  await expect(sheet(page).locator('.lblrows').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});
