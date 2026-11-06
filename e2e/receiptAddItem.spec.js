import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Add to list on the receipt sheet (brief receipt-add-item). The draft defaults, the staged plan, the creating and the Undo are node tests (groceryReceipt.test.ts); this
// covers the wiring a unit test cannot: the button on an unmatched row, the pre-filled form, the New pill and footer count, Cancel leaving the list alone, a duplicate being
// refused, and Apply then Undo through the real store. The route is stubbed: no photo leaves the test.
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };

test.describe('as an admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
    await page.reload();
    await page.click('#tab-daily'); await page.click('#daily-grocery');
    await page.click('#groc-edit');
    await add(page, 'Eggs'); await add(page, 'Rice');
    await page.click('#groc-done');
    await page.click('#groc-view-get');
    await page.route('**/api/scan/receipt', async route => {
      const { items } = route.request().postDataJSON();
      const id = n => items.find(i => i.n === n)?.id ?? null;
      const receipt = { store: "BJ'S", date: '2026-09-24', totalCents: 3497, taxCents: 0, lines: [
        { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') },
        { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 899, discountCents: 100, matchId: null },
      ] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt } }) });
    });
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt' })).toBeVisible();
  });

  test('Add to list stages a pre-filled item, Apply creates it bought with the receipt price, and Undo removes it', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await expect(page.locator('#groc-summary')).toContainText('Got 0 of 2');
    await sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' }).click();
    await expect(sheet.locator('#rc-new-name')).toHaveValue('Zevia soda 12pk');
    await expect(sheet.locator('#rc-new-price')).toHaveValue('7.99'); // 8.99 less 1.00 savings
    await sheet.locator('#rc-new-add').click();
    await expect(sheet.getByText('New', { exact: true })).toBeVisible();
    await expect(sheet.getByText('1 new item will be added.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Apply 2 items' })).toBeEnabled();
    await expect(page.locator('#groc-summary')).toContainText('Got 0 of 2'); // staged only: nothing reached the list
    await sheet.getByRole('button', { name: 'Apply 2 items' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#groc-summary')).toContainText('Got 2 of 3');
    await expect(page.getByText('Added Zevia soda 12pk to Anywhere.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#groc-summary')).toContainText('Got 0 of 2');
    await expect(page.getByText('Zevia soda 12pk')).toHaveCount(0);
  });

  test('Not now and Cancel leave the list as it was', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' }).click();
    await sheet.locator('#rc-new-cancel').click();
    await expect(sheet.locator('#rc-new-name')).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' }).click();
    await sheet.locator('#rc-new-add').click();
    await sheet.getByRole('button', { name: 'Remove' }).click(); // the row goes back to "Not on your list"
    await expect(sheet.getByLabel('Item for ZEVIA SODA 12PK')).toHaveValue('');
    await sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' }).click();
    await sheet.locator('#rc-new-add').click();
    await sheet.locator('#rc-cancel').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#groc-summary')).toContainText('Got 0 of 2');
  });

  test('a name already on the list is refused in the form and stages nothing', async ({ page }) => {
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Add to list: ZEVIA SODA 12PK' }).click();
    await sheet.locator('#rc-new-store').selectOption('');
    await sheet.locator('#rc-new-name').fill('eggs');
    await sheet.locator('#rc-new-add').click();
    await expect(sheet.getByRole('alert')).toContainText('already in this store');
    await expect(sheet.getByText('New', { exact: true })).toHaveCount(0);
    await sheet.locator('#rc-new-name').fill('');
    await sheet.locator('#rc-new-add').click();
    await expect(sheet.getByRole('alert')).toHaveText('Give the item a name.');
  });
});
