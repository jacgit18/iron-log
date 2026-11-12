import { test, expect } from './fixtures.js';
import { startFood } from './recipesNav.js';

// Scan barcode in the food search box (brief barcode-scan). The code check, the route and the client are node tests (shared/barcode.test.ts, foodBarcode.test.ts,
// barcodeScan.test.ts); this covers the wiring a unit test cannot: the button for any signed-in account, the sheet, a read code becoming a pick that fills the real form,
// each way it can fail leaving the form usable, and the camera being let go. The browser's reader, the camera and the route are stubbed; the real camera and a
// real product are the owner's check on a phone.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const photo = { name: 'barcode.png', mimeType: 'image/png', buffer: PNG };
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const withReader = (page, codes) => page.addInitScript(c => {
  window.__codes = c;
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13', 'upc_a', 'ean_8', 'upc_e', 'qr_code']; } async detect() { return window.__codes; } };
}, codes);
const noCamera = page => page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
const openForm = async page => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await startFood(page);
};
const CHEERIOS = { ok: true, hit: { id: 2, name: 'Cheerios Cereal', brand: 'General Mills', kcal: 380, p: 10, c: 70, f: 6, serving: 28 } };
const answer = (page, status, body) => page.route('**/api/foods/barcode/*', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));

test.describe('as an admin', () => {
  test('a photo of a barcode becomes a pick, and Use fills the real form with the serving’s numbers', async ({ page }) => {
    await asAdmin(page); await withReader(page, [{ rawValue: '016000275287', format: 'upc_a' }]); await noCamera(page);
    const asked = [];
    await page.route('**/api/foods/barcode/*', route => { asked.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHEERIOS) }); });
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await expect(page.getByRole('heading', { name: 'Scan barcode' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'The camera is not available' })).toBeVisible();
    await page.getByLabel('Barcode photo').setInputFiles(photo);
    await expect(page.getByRole('heading', { name: 'Scan barcode' })).toHaveCount(0); // found: the sheet closes
    expect(asked).toEqual(['/api/foods/barcode/00016000275287']); // the 12-digit UPC-A went as 14 digits
    await expect(page.getByText('Cheerios Cereal (General Mills) · 380 kcal per 100 g')).toBeVisible();
    await expect(page.getByLabel('Grams')).toHaveValue('28'); // the product’s own serving
    await page.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Cheerios Cereal');
    await expect(page.getByLabel('Calories per serving')).toHaveValue('106');
    await expect(page.getByLabel('Protein per serving (g)')).toHaveValue('2.8');
  });

  test('a code that is not in the database says so and leaves the form empty and usable', async ({ page }) => {
    await asAdmin(page); await withReader(page, [{ rawValue: '4006381333931', format: 'ean_13' }]); await noCamera(page);
    await answer(page, 404, { ok: false, error: 'no product has that barcode', why: 'not-found' });
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await page.getByLabel('Barcode photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'not in USDA or Open Food Facts' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByLabel('Calories per serving')).toHaveValue('');
    await page.getByLabel('Name', { exact: true }).fill('Typed instead');
    await page.getByLabel('Calories per serving').fill('100');
    await page.getByLabel('Protein per serving (g)').fill('5');
    await page.getByRole('button', { name: 'Save food' }).click();
    await expect(page.getByRole('heading', { name: /Typed instead/ })).toBeVisible();
  });

  test('a product from Open Food Facts shows where it came from and to check the label; a USDA product shows no such note', async ({ page }) => {
    await asAdmin(page); await withReader(page, [{ rawValue: '4099100063851', format: 'ean_13' }]); await noCamera(page);
    await answer(page, 200, { ok: true, hit: { id: 4099100063851, name: 'Woven Whole Wheat Crackers', brand: 'Aldi', kcal: 429, p: 7.1, c: 71.4, f: 14.3, serving: 28, source: 'off' } });
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await page.getByLabel('Barcode photo').setInputFiles(photo);
    await expect(page.getByText('Data from Open Food Facts. Crowd-sourced: check the numbers against the label.')).toBeVisible();
    await page.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(page.getByLabel('Calories per serving')).toHaveValue('120'); // 28 g of 429 kcal per 100 g; still editable, nothing saved
    await expect(page.getByText('Data from Open Food Facts')).toHaveCount(0);

    await answer(page, 200, CHEERIOS);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await page.getByLabel('Barcode photo').setInputFiles(photo);
    await expect(page.getByText('Cheerios Cereal (General Mills)')).toBeVisible();
    await expect(page.getByText('Data from Open Food Facts')).toHaveCount(0);
  });

  test('a code found nowhere offers Photo the label on the Ready-made form, which opens the form’s own label camera', async ({ page }) => {
    await asAdmin(page); await withReader(page, [{ rawValue: '4006381333931', format: 'ean_13' }]); await noCamera(page);
    await answer(page, 404, { ok: false, error: 'no product has that barcode', why: 'not-found' });
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await page.getByLabel('Barcode photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'not in USDA or Open Food Facts' })).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Photo the label' }).click();
    await chooser; // the same camera input as Scan label
    await expect(page.getByRole('heading', { name: 'Scan barcode' })).toHaveCount(0);
    await expect(page.getByLabel('Calories per serving')).toHaveValue('');
  });

  test('a photo with no readable code, and a browser with no reader, each say what to do', async ({ page }) => {
    await asAdmin(page); await withReader(page, []); await noCamera(page);
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await page.getByLabel('Barcode photo').setInputFiles(photo);
    await expect(page.getByRole('status').filter({ hasText: 'Could not read a barcode' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    // A new page load with no BarcodeDetector at all (Firefox, some Safari).
    await page.addInitScript(() => { delete window.BarcodeDetector; });
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'cannot read barcodes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Photo instead' })).toHaveCount(0);
  });

  test('Back closes the sheet and the app stays where it was', async ({ page }) => {
    await asAdmin(page); await withReader(page, []); await noCamera(page);
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await expect(page.getByRole('heading', { name: 'Scan barcode' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Scan barcode' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'New food' })).toBeVisible();
  });

  test('a live camera finds the code by itself, and the camera is let go when the sheet closes', async ({ page }) => {
    await asAdmin(page); await withReader(page, []);
    await page.addInitScript(() => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const ctx = c.getContext('2d');
      let n = 0;
      setInterval(() => { ctx.fillStyle = n++ % 2 ? '#336699' : '#996633'; ctx.fillRect(0, 0, 320, 240); }, 40);
      window.__stopped = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        const s = c.captureStream(25);
        for (const t of s.getTracks()) { const stop = t.stop.bind(t); t.stop = () => { window.__stopped++; stop(); }; }
        return s;
      };
    });
    await answer(page, 200, CHEERIOS);
    await page.reload();
    await openForm(page);
    await page.getByRole('button', { name: 'Scan barcode' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Point the camera at the barcode' })).toBeVisible();
    await page.evaluate(() => { window.__codes = [{ rawValue: '016000275287', format: 'upc_a' }]; }); // the reader now "sees" a barcode
    await expect(page.getByText('Cheerios Cereal (General Mills)')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scan barcode' })).toHaveCount(0);
    expect(await page.evaluate(() => window.__stopped)).toBeGreaterThan(0); // closing the sheet stopped the camera
  });
});

test('a signed-in account that is not an admin can scan a barcode, and its miss offers the AI label photo (open to everyone since 2026-11-08)', async ({ page }) => {
  await withReader(page, [{ rawValue: '4006381333931', format: 'ean_13' }]); await noCamera(page);
  await answer(page, 404, { ok: false, error: 'no product has that barcode', why: 'not-found' });
  await page.reload();
  await openForm(page);
  await page.getByRole('button', { name: 'Scan barcode' }).click();
  await page.getByLabel('Barcode photo').setInputFiles(photo);
  await expect(page.getByRole('status').filter({ hasText: 'not in USDA or Open Food Facts' })).toBeVisible(); // the lookup went through for a non-admin
  await expect(page.locator('#bc-label')).toHaveCount(1); // Photo the label is the AI scan, open to everyone
});
