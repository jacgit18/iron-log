import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openSupplementEditor } from './nutritionBoardHelpers.js';

// Brief supplement-add-redesign: one add sheet on Manage, one search over yours and the catalog, results that tell two label years of one product apart, the label before Add, one time of day,
// and Back closing the sheet. The result line, the add plan and the import mapping are node tests (supplementResultLine.test.ts, supplementAddPlan.test.ts, catalogImport.test.ts); this covers the wiring a
// node test cannot see: the sheet, the inline preview, the instance it makes, Back and axe. The fixed clock is Thursday 2026-09-24.
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
const pull = { rows: [
  { table: 'list_items', list: 'supplement_item', client_id: 'fishoil', position: 0, data: { id: 'fishoil', n: 'Fish Oil', slot: 'morning', dose: '1 g' }, ...rowBase, seq: '1' },
], cursor: '1', more: false };
const megaMen = [
  { id: 'c:dsld:900', name: 'Mega Men', brand: 'Nature Made', data: { form: 'Tablet', entryYear: 2020, upc: '031604026505' } },
  { id: 'c:dsld:901', name: 'Mega Men', brand: 'Nature Made', data: { form: 'Tablet', entryYear: 2016, upc: '031604026499' } },
];
const labelOf = year => ({ label: { name: 'Mega Men', brand: 'Nature Made', entryYear: year, serving: { text: '1 tablet', units: 1, form: 'tablet' }, rows: [{ key: 'zinc', amount: year === 2020 ? 15 : 11, unit: 'mg' }], other: [] } });

async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [] }));
  await page.route('**/api/catalog/search?*', route => {
    const q = new URL(route.request().url()).searchParams.get('q').toLowerCase();
    return json(200, { ok: true, items: megaMen.filter(p => q.split(' ').every(w => `${p.name} ${p.brand}`.toLowerCase().includes(w))), more: false })(route);
  });
  await page.route('**/api/supplement-label/*', route => json(200, labelOf(route.request().url().endsWith('900') ? 2020 : 2016))(route));
  await page.goto('/');
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await openSupplementEditor(page);
}
const sheet = page => page.getByRole('dialog', { name: 'Add a supplement' });

test('Manage has one + Add, the per-time pickers are gone, and the sheet lists yours first', async ({ page }) => {
  await open(page);
  await expect(page.locator('#suplib-add')).toHaveText('+ Add');
  await expect(page.locator('#suplib-new')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /^Add to / })).toHaveCount(0);
  await expect(page.locator('[id^="suppname-"]')).toHaveCount(0);
  await expect(page.locator('#catmatch-supplement')).toHaveCount(0); // the library's own catalog section is gone
  await page.locator('#suplib-add').click();
  await expect(sheet(page)).toContainText('Type 2 letters of a name or brand.');
  await sheet(page).locator('#suppadd-q').fill('fish');
  await expect(sheet(page).getByRole('list', { name: 'Results' }).getByRole('button').first()).toContainText('Fish Oil');
});

test('two label years of one product are told apart, and picking each shows its own label before Add', async ({ page }) => {
  await open(page);
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('mega men');
  const results = sheet(page).getByRole('list', { name: 'Results' }).getByRole('button');
  await expect(results.filter({ hasText: '2020 label' })).toHaveCount(1);
  await expect(results.filter({ hasText: '2016 label' })).toHaveCount(1);
  await results.filter({ hasText: '2016 label' }).click();
  await expect(sheet(page)).toContainText('UPC 031604026499');
  await expect(sheet(page).getByRole('heading', { name: 'In one serving' })).toBeVisible();
  await expect(sheet(page).locator('.lblrows')).toContainText('11 mg');
  await sheet(page).getByRole('button', { name: 'Change' }).click();
  await sheet(page).getByRole('button', { name: /2020 label/ }).click();
  await expect(sheet(page).locator('.lblrows')).toContainText('15 mg');
});

test('Add saves the product with its amounts in the chosen time of day, and adding again to another time makes a second instance', async ({ page }) => {
  await open(page);
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('mega men');
  await sheet(page).getByRole('button', { name: /2020 label/ }).click();
  await expect(sheet(page).locator('.lblrows')).toContainText('15 mg');
  await sheet(page).getByLabel('Morning').check();
  await page.fill('#suppadd-dose', '1 tab');
  await page.click('#suppadd-go');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Morning' }).locator('.srow')).toContainText(['Fish Oil1 g', 'Mega Men1 tab']);
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('mega');
  await sheet(page).getByRole('button', { name: /^Mega Men.*Library/ }).click();
  await sheet(page).getByLabel('Night').check();
  await page.click('#suppadd-go');
  await expect(page.getByRole('group', { name: 'Night' }).locator('.srow')).toContainText(['Mega Men1 tab']);
  await expect(page.getByRole('group', { name: 'Morning' }).locator('.srow')).toContainText(['Fish Oil1 g', 'Mega Men1 tab']);
  await page.getByRole('button', { name: 'Edit Mega Men in Night' }).click();
  await expect(page.getByLabel('Amount 1')).toHaveValue('15'); // the label's amounts came along
});

test('a failed label lookup still adds, with a Try again', async ({ page }) => {
  await open(page);
  await page.route('**/api/supplement-label/*', json(502, { ok: false }));
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('mega men');
  await sheet(page).getByRole('button', { name: /2020 label/ }).click();
  await expect(sheet(page).getByText("Could not load this product's amounts.")).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.click('#suppadd-go');
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Morning' }).locator('.srow')).toContainText(['Mega Men']);
});

test('a name with no match adds as a new supplement', async ({ page }) => {
  await open(page);
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('Zzyzx tonic');
  await expect(sheet(page).getByText('No match.')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: /Add “Zzyzx tonic” as a new supplement/ })).toBeVisible();
  await page.click('#suppadd-go');
  await expect(page.getByRole('group', { name: 'Morning' }).locator('.srow')).toContainText(['Fish Oil1 g', 'Zzyzx tonic']);
});

test('the sheet adds one Back step: Back closes it onto Manage, and a reload returns to the board', async ({ page }) => {
  await open(page);
  await page.locator('#suplib-add').click();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await page.locator('#suplib-add').click();
  await page.reload();
  await expect(sheet(page)).toHaveCount(0);
});

test('the add sheet has no accessibility violations', async ({ page }) => {
  await open(page);
  await page.locator('#suplib-add').click();
  await sheet(page).locator('#suppadd-q').fill('mega men');
  await sheet(page).getByRole('button', { name: /2020 label/ }).click();
  await expect(sheet(page).locator('.lblrows')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
});
