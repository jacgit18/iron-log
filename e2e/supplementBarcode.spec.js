import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { openSupplementEditor } from './nutritionBoardHelpers.js';

// Brief supplement-barcode-search: a scanned or typed UPC becomes a product name that fills the supplement add sheet's search. The UPC check, the search words, the messages and the route are node
// tests (supplementBarcodeQuery.test.ts, supplementBarcode.test.ts); this covers the wiring a node test cannot see: the button, the camera sheet replacing and reopening the add sheet, the filled search
// and its listings, typing a UPC, each failure leaving the sheet usable, Back, and axe. The browser's reader, the camera and the route are stubbed; a real camera and a real bottle are the owner's check.
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
const pull = { rows: [{ table: 'list_items', list: 'supplement_item', client_id: 'fishoil', position: 0, data: { id: 'fishoil', n: 'Fish Oil', slot: 'morning', dose: '1 g' }, ...rowBase, seq: '1' }], cursor: '1', more: false };
const megaMen = [
  { id: 'c:dsld:900', name: 'Mega Men', brand: 'Nature Made', data: { form: 'Tablet', entryYear: 2020 } },
  { id: 'c:dsld:901', name: 'Mega Men', brand: 'Nature Made', data: { form: 'Tablet', entryYear: 2016 } },
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'barcode.png', mimeType: 'image/png', buffer: PNG };
const UPC = '031604026509'; // a valid UPC-A
const withReader = (page, codes) => page.addInitScript(c => {
  window.__codes = c;
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13', 'upc_a', 'ean_8', 'upc_e']; } async detect() { return window.__codes; } };
}, codes);
const noCamera = page => page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });

async function open(page, product = { ok: true, name: 'MEGA MEN', brand: 'Nature Made' }) {
  await page.addInitScript(() => { localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
  const asked = [];
  await page.route('**/api/supplement-barcode/*', route => { asked.push(new URL(route.request().url()).pathname); return product.ok ? json(200, product)(route) : json(404, { ok: false, why: 'not-found' })(route); });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [] }));
  await page.route('**/api/catalog/search?*', route => {
    const q = new URL(route.request().url()).searchParams.get('q').toLowerCase();
    return json(200, { ok: true, items: megaMen.filter(p => q.split(' ').every(w => `${p.name} ${p.brand}`.toLowerCase().includes(w))), more: false })(route);
  });
  await page.route('**/api/supplement-label/*', json(200, { label: { name: 'Mega Men', brand: 'Nature Made', entryYear: 2020, serving: { text: '1 tablet', units: 1, form: 'tablet' }, rows: [{ key: 'zinc', amount: 15, unit: 'mg' }], other: [] } }));
  return asked;
}
async function gotoSheet(page) {
  await page.goto('/');
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await openSupplementEditor(page);
  await page.locator('#suplib-add').click();
}
const add = page => page.getByRole('dialog', { name: 'Add a supplement' });
const camera = page => page.getByRole('dialog', { name: 'Scan barcode' });

test('a photo of a barcode fills the add sheet’s search with the product, and picking a listing shows its label', async ({ page }) => {
  await withReader(page, [{ rawValue: UPC, format: 'upc_a' }]); await noCamera(page);
  const asked = await open(page);
  await gotoSheet(page);
  await expect(add(page).locator('#suppadd-q')).toHaveValue('');
  await add(page).getByRole('button', { name: 'Scan barcode' }).click();
  await expect(camera(page)).toBeVisible();
  await camera(page).getByLabel('Barcode photo').setInputFiles(photo);
  await expect(camera(page)).toHaveCount(0); // found: the camera sheet is replaced by the add sheet again
  expect(asked).toEqual([`/api/supplement-barcode/${UPC.padStart(14, '0')}`]);
  await expect(add(page).locator('#suppadd-q')).toHaveValue('Nature Made MEGA MEN');
  await expect(add(page)).toContainText('From the barcode: MEGA MEN');
  const results = add(page).getByRole('list', { name: 'Results' }).getByRole('button');
  await expect(results.filter({ hasText: '2020 label' })).toHaveCount(1);
  await expect(results.filter({ hasText: '2016 label' })).toHaveCount(1);
  await results.filter({ hasText: '2020 label' }).click();
  await expect(add(page).locator('.lblrows')).toContainText('15 mg'); // nothing was picked for the person; the label is the usual one
});

test('typing a UPC in the search box does the same, and an ordinary name is still a name search', async ({ page }) => {
  const asked = await open(page);
  await gotoSheet(page);
  await add(page).locator('#suppadd-q').fill('mega men');
  await expect(add(page).getByRole('list', { name: 'Results' }).getByRole('button').first()).toContainText('Mega Men');
  expect(asked).toEqual([]); // a name is not looked up as a barcode
  await add(page).locator('#suppadd-q').fill('0 31604 02650 9');
  await expect(add(page).locator('#suppadd-q')).toHaveValue('Nature Made MEGA MEN');
  expect(asked).toEqual([`/api/supplement-barcode/${UPC}`]);
  await expect(add(page).getByRole('list', { name: 'Results' }).getByRole('button').first()).toContainText('Mega Men');
});

// The UPC table (catalog:upcs) answers the exact listing: the sheet opens with it already picked and its label showing, with no list to choose from.
const exact = { ok: true, name: 'Mega Men', brand: 'Nature Made', listing: { id: 'c:dsld:900', name: 'Mega Men', brand: 'Nature Made', data: { form: 'Tablet', entryYear: 2020 } } };

test('a typed UPC the table knows picks that exact listing and shows its label, with no list to choose from', async ({ page }) => {
  const asked = await open(page, exact);
  await gotoSheet(page);
  await add(page).locator('#suppadd-q').fill('0 31604 02650 9');
  await expect(add(page)).toContainText('Found by barcode');
  await expect(add(page).locator('#suppadd-q')).toHaveValue('Mega Men');
  await expect(add(page).getByRole('list', { name: 'Results' })).toHaveCount(0);
  await expect(add(page).locator('.lblrows')).toContainText('15 mg');
  expect(asked).toEqual([`/api/supplement-barcode/${UPC}`]);
  await add(page).locator('#suppadd-q').fill('mega'); // typing again drops the pick and the note: it is an ordinary search
  await expect(add(page)).not.toContainText('Found by barcode');
  await expect(add(page).getByRole('list', { name: 'Results' }).getByRole('button').first()).toContainText('Mega Men');
});

test('a scanned UPC the table knows comes back to the add sheet with the exact listing picked', async ({ page }) => {
  await withReader(page, [{ rawValue: UPC, format: 'upc_a' }]); await noCamera(page);
  await open(page, exact);
  await gotoSheet(page);
  await add(page).getByRole('button', { name: 'Scan barcode' }).click();
  await camera(page).getByLabel('Barcode photo').setInputFiles(photo);
  await expect(camera(page)).toHaveCount(0);
  await expect(add(page)).toContainText('Found by barcode');
  await expect(add(page).locator('.lblrows')).toContainText('15 mg');
  await expect(add(page).getByRole('list', { name: 'Results' })).toHaveCount(0);
  await expect(add(page).locator('#suppadd-go')).toBeEnabled();
});

test('a barcode that finds no product says so and the sheet stays usable for typing', async ({ page }) => {
  await open(page, { ok: false });
  await gotoSheet(page);
  await add(page).locator('#suppadd-q').fill(UPC);
  await expect(add(page).getByRole('status').filter({ hasText: 'No product found for that barcode' })).toBeVisible();
  await expect(add(page).getByRole('list', { name: 'Results' })).toHaveCount(0);
  await add(page).locator('#suppadd-q').fill('mega men');
  await expect(add(page).getByRole('list', { name: 'Results' }).getByRole('button').first()).toContainText('Mega Men');
});

test('no reader in the browser says to type the name, Close returns to the add sheet as it was, and Back closes it all onto the app', async ({ page }) => {
  await noCamera(page);
  await open(page);
  await gotoSheet(page);
  await add(page).locator('#suppadd-q').fill('fish');
  await add(page).getByRole('button', { name: 'Scan barcode' }).click();
  await expect(camera(page).getByRole('status')).toContainText(/cannot read barcodes|camera is not available/);
  expect((await new AxeBuilder({ page }).include('.sbsheet').analyze()).violations).toEqual([]);
  await camera(page).getByRole('button', { name: 'Close' }).click();
  await expect(add(page)).toBeVisible();
  await expect(add(page).locator('#suppadd-q')).toHaveValue('fish'); // the text came back
  await add(page).getByRole('button', { name: 'Scan barcode' }).click();
  await page.goBack();
  await expect(camera(page)).toHaveCount(0);
  await expect(page.locator('#tab-daily')).toBeVisible(); // the app stayed where it was
});
