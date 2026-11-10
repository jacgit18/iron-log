import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Rename on the receipt sheet and remember the name (brief receipt-rename-memory). The lookup, the merge of names and Undo's data are node tests (groceryAliases.test.ts); this
// covers what they cannot: the name field on every row, the Remember tick appearing only after a change, a saved name matching the next scan before the model's guess, the
// item's receipt names with Forget and its Undo, and Undo of Apply through the real store. The scan route is stubbed: no photo leaves the test.
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };

test.describe('as an admin', () => {
  let lines;
  const scan = async page => {
    await page.getByLabel('Receipt photo').setInputFiles(photo);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
    return page.getByRole('dialog');
  };
  test.beforeEach(async ({ page }) => {
    lines = [
      { text: 'EGGS LRG 5 DZ', qty: 1, grossCents: 500, discountCents: 0, match: 'Eggs' },
      { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 899, discountCents: 0, match: null },
    ];
    await page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
    await page.reload();
    await page.click('#tab-daily'); await page.click('#daily-grocery');
    await page.click('#groc-edit');
    await add(page, 'Eggs'); await add(page, 'Rice');
    await page.click('#groc-done');
    await page.click('#groc-view-shopping');
    await page.route('**/api/scan/receipt', async route => {
      const { items } = route.request().postDataJSON();
      const receipt = { store: "BJ'S", date: '2026-09-24', totalCents: 1399, taxCents: 0, lines: lines.map(l => ({ text: l.text, qty: l.qty, grossCents: l.grossCents, discountCents: l.discountCents, matchId: l.match ? items.find(i => i.n === l.match)?.id ?? null : null })) };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt } }) });
    });
  });

  test('every row has a name field; Remember shows only after a change, and a saved name matches the next scan', async ({ page }) => {
    let sheet = await scan(page);
    await expect(sheet.getByLabel('Name for EGGS LRG 5 DZ')).toHaveValue('Eggs');
    await expect(sheet.getByLabel('Name for ZEVIA SODA 12PK')).toHaveValue('');
    await expect(sheet.getByLabel('Remember this name for EGGS LRG 5 DZ')).toHaveCount(0); // a match left alone is not remembered
    await sheet.getByLabel('Name for EGGS LRG 5 DZ').fill('Large eggs');
    await sheet.getByLabel('Name for EGGS LRG 5 DZ').press('Enter');
    await expect(sheet.getByLabel('Remember this name for EGGS LRG 5 DZ')).toBeChecked();
    await sheet.getByRole('button', { name: /^Apply/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Remembered 1 receipt name.')).toBeVisible();
    // the second scan: the model guesses nothing for that text, the saved name still maps it
    lines[0].match = null;
    sheet = await scan(page);
    await expect(sheet.getByLabel('Item for EGGS LRG 5 DZ')).not.toHaveValue('');
    await expect(sheet.getByLabel('Name for EGGS LRG 5 DZ')).toHaveValue('Large eggs');
    await expect(sheet.getByText('Matched your earlier rename')).toBeVisible();
    await expect(sheet.getByLabel('Name for ZEVIA SODA 12PK')).toHaveValue('');
  });

  test('an unlisted line renamed and applied creates the item and remembers the text; Undo takes both back', async ({ page }) => {
    const sheet = await scan(page);
    await sheet.getByLabel('Add this store to your stores').uncheck();
    await sheet.getByLabel('Name for ZEVIA SODA 12PK').fill('Zevia soda');
    await sheet.getByLabel('Name for ZEVIA SODA 12PK').press('Enter');
    await expect(sheet.getByText('New', { exact: true })).toBeVisible();
    await expect(sheet.getByLabel('Remember this name for ZEVIA SODA 12PK')).toBeChecked();
    await sheet.getByRole('button', { name: /^Apply/ }).click();
    await expect(page.getByText('Added Zevia soda to Anywhere.')).toBeVisible();
    await expect(page.getByText('Remembered 1 receipt name.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.click('#groc-view-inventory');
    await expect(page.getByText('Zevia soda')).toHaveCount(0);
  });

  test('Remember off saves nothing; a text saved for another item says it will move', async ({ page }) => {
    let sheet = await scan(page);
    await sheet.getByLabel('Name for EGGS LRG 5 DZ').fill('Large eggs');
    await sheet.getByLabel('Name for EGGS LRG 5 DZ').press('Enter');
    await sheet.getByLabel('Remember this name for EGGS LRG 5 DZ').uncheck();
    await sheet.getByRole('button', { name: /^Apply/ }).click();
    await expect(page.getByText('Remembered')).toHaveCount(0);
    sheet = await scan(page);
    await sheet.getByLabel('Item for EGGS LRG 5 DZ').selectOption({ label: 'Not on your list' });
    await expect(sheet.getByLabel('Remember this name for EGGS LRG 5 DZ')).toHaveCount(0); // no item, nothing to remember
    await sheet.getByLabel('Item for EGGS LRG 5 DZ').selectOption({ label: 'Large eggs' });
    await expect(sheet.getByText('Matched your earlier rename')).toHaveCount(0);
    await sheet.getByLabel('Item for EGGS LRG 5 DZ').selectOption({ label: 'Rice' });
    await sheet.getByRole('button', { name: /^Apply/ }).click(); // Rice now holds the text
    sheet = await scan(page);
    await expect(sheet.getByLabel('Item for EGGS LRG 5 DZ').locator('option:checked')).toHaveText('Rice');
    await sheet.getByLabel('Item for EGGS LRG 5 DZ').selectOption({ label: 'Large eggs' });
    await expect(sheet.getByText('is saved for Rice now. Remembering it moves it here.')).toBeVisible();
  });

  test('the item edit row lists receipt names; Forget removes one and Undo brings it back', async ({ page }) => {
    const sheet = await scan(page);
    await sheet.getByLabel('Name for EGGS LRG 5 DZ').fill('Large eggs');
    await sheet.getByLabel('Name for EGGS LRG 5 DZ').press('Enter');
    await sheet.getByRole('button', { name: /^Apply/ }).click();
    await page.click('#groc-view-inventory');
    await page.click('#groc-edit');
    await page.getByRole('button', { name: 'Expand Large eggs' }).click();
    const names = page.getByRole('group', { name: 'Receipt names for Large eggs' });
    await expect(names).toContainText('EGGS LRG 5 DZ');
    await names.getByRole('button', { name: 'Forget EGGS LRG 5 DZ' }).click();
    await expect(names).toHaveCount(0);
    await expect(page.getByText('Removed the receipt name “EGGS LRG 5 DZ” from Large eggs.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('group', { name: 'Receipt names for Large eggs' })).toContainText('EGGS LRG 5 DZ');
  });
});
