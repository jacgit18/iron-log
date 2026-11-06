import { test, expect } from './fixtures.js';

// The Scan barcode miss screen (brief barcode-miss-ladder): what was tried, Type the name as the free main choice, and the AI label photo second with its cost and
// what is left. The words and the count are node tests (barcodeScan.test.ts, labelAllowance.test.ts); this covers the wiring: the food search box in the Diet panel
// offers the label photo (not only the Ready-made form), the camera opens at once, the AI result is marked and checked before Use, and a used-up cap switches the
// button off while typing still works. The reader, the camera and both routes are stubbed; a real label and a real phone are the owner's check.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'barcode.png', mimeType: 'image/png', buffer: PNG };
const diet = page => page.getByRole('region', { name: 'Diet' });
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const withReader = page => page.addInitScript(() => {
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13']; } async detect() { return [{ rawValue: '4006381333931', format: 'ean_13' }]; } };
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
});
const miss = (page, delay = 0) => page.route('**/api/foods/barcode/*', async route => {
  if (delay) await new Promise(r => setTimeout(r, delay));
  await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'no product has that barcode', why: 'not-found' }) });
});
const label = (page, status, body) => page.route('**/api/scan/label', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
const scanMiss = async page => {
  await page.getByRole('button', { name: 'Scan barcode' }).first().click();
  await page.getByLabel('Barcode photo').setInputFiles(photo);
};

test.beforeEach(async ({ page }) => {
  await asAdmin(page); await withReader(page);
  await page.goto('/');
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-supplements');
});

test('a miss lists what was tried, makes Type the name the main button and puts the cursor in the search box', async ({ page }) => {
  await miss(page, 1800);
  await page.getByRole('button', { name: 'Scan barcode' }).first().click();
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  await expect(page.getByRole('status').filter({ hasText: 'Checking USDA...' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Checking Open Food Facts...' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'Tried' });
  await expect(steps.getByRole('listitem')).toHaveText(['USDA: not found', 'Open Food Facts: not found']);
  await expect(page.getByRole('button', { name: 'Type the name' })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'Photo the label' })).toBeVisible();
  await expect(page.getByText('Uses AI', { exact: true })).toBeVisible(); // no count until an answer has carried one
  for (const name of ['Photo of the barcode', 'Close']) await expect(page.getByRole('button', { name })).toBeVisible(); // links; Scan again needs a live camera
  await page.getByRole('button', { name: 'Type the name' }).click();
  await expect(page.getByRole('heading', { name: 'Scan barcode' })).toHaveCount(0);
  await expect(diet(page).getByLabel('Search your past meals and recipes')).toBeFocused();
});

test('Photo the label from the food search box opens the camera at once, and the AI result is marked and checked before Use', async ({ page }) => {
  await miss(page);
  await label(page, 200, { ok: true, result: { kind: 'ok', label: { name: 'Gnocchi', kcal: 210, p: 6, c: 40, f: 1 } }, left: 7, max: 30 });
  await scanMiss(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Photo the label' }).click();
  await (await chooser).setFiles(photo);
  await expect(diet(page).getByText('AI', { exact: true })).toBeVisible();
  await expect(diet(page).getByText('Read from the photo. Check these numbers against the label.')).toBeVisible();
  await expect(diet(page).getByText('210 kcal · 6 g protein per serving')).toBeVisible();
  await expect(diet(page).getByLabel('Food', { exact: true })).toHaveValue(''); // nothing is filled until Use
  await diet(page).getByRole('button', { name: 'Use', exact: true }).click();
  await expect(diet(page).getByLabel('Food', { exact: true })).toHaveValue('Gnocchi');
  await expect(diet(page).getByLabel('Calories', { exact: true })).toHaveValue('210');

  // The answer carried the shared count, so the next miss shows it.
  await scanMiss(page);
  await expect(page.getByText('Uses AI · 7 of 30 left today')).toBeVisible();
});

test('when the daily cap is used up the label button is off with the reason, and typing still works', async ({ page }) => {
  await miss(page);
  await label(page, 503, { ok: false, error: 'label scan is not available right now', why: 'cap' });
  await scanMiss(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Photo the label' }).click();
  await (await chooser).setFiles(photo);
  await expect(diet(page).getByRole('status').filter({ hasText: 'used up for today' })).toBeVisible();
  await scanMiss(page);
  await expect(page.getByRole('button', { name: 'Photo the label' })).toBeDisabled();
  await expect(page.getByText('Label photos are used up for today. Type the name instead.')).toBeVisible();
  await page.getByRole('button', { name: 'Type the name' }).click();
  await expect(diet(page).getByLabel('Search your past meals and recipes')).toBeFocused();
});
