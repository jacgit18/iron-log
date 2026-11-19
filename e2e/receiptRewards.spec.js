import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { photo } from './receiptHelpers.js';

// Receipt rewards credit (brief receipt-rewards-credit). The amounts and the split are node tests (groceryReceipt, grocery, grocerySplit, grocerySplitSync); this covers the wiring:
// the sheet's numbers line (Lines, Tax, Receipt total, the Rewards box, You paid), the Rewards box refusing a bad amount, Apply writing the credit so Spent drops, the Rewards box
// beside Tax on To get, and Undo. The route is stubbed: no photo leaves the test. Lines 26.98 + 3.49 + 8.00 = 38.47, tax 1.00, total 39.47, rewards 5.00, paid 34.47.
const asAdmin = page => page.addInitScript(() => localStorage.setItem('ironlog:session/admin', 'true'));
const add = async (page, n) => { await page.fill('#groc-name', n); await page.click('#groc-add'); await expect(page.locator('#groc-name')).toHaveValue(''); };
const setup = async page => {
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-edit');
  await add(page, 'Eggs'); await add(page, 'Rice');
  await page.click('#groc-done');
  await page.click('#groc-view-shopping');
};
const scan = (page, rewardsCents) => page.route('**/api/scan/receipt', async route => {
  const { items } = route.request().postDataJSON();
  const id = n => items.find(i => i.n === n)?.id ?? null;
  const receipt = { store: "BJ'S", date: '2026-09-24', taxCents: 100, totalCents: 3947, ...(rewardsCents ? { rewardsCents } : {}), lines: [
    { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: id('Eggs') },
    { text: 'RICE 10LB', qty: 1, grossCents: 349, discountCents: 0, matchId: id('Rice') },
    { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 800, discountCents: 0, matchId: null },
  ] };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { kind: 'ok', receipt } }) });
});
const open = async (page, rewardsCents) => {
  await scan(page, rewardsCents);
  await page.getByLabel('Receipt photo').setInputFiles(photo);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Receipt' })).toBeVisible();
  return sheet;
};

test.beforeEach(async ({ page }) => { await asAdmin(page); await page.reload(); await setup(page); });

test('the numbers line shows the scan\'s rewards in a box and You paid; typing changes it, clearing removes it, a bad amount is refused', async ({ page }) => {
  const sheet = await open(page, 500);
  const nums = sheet.locator('.rcnums');
  await expect(nums).toContainText('Lines $38.47');
  await expect(nums).toContainText('Tax $1.00');
  await expect(nums).toContainText('Receipt total $39.47');
  const box = sheet.getByLabel(/^Rewards/);
  await expect(box).toHaveValue('5.00');
  await expect(nums).toContainText('You paid $34.47');
  await box.fill('20.00');
  await expect(nums).toContainText('You paid $19.47');
  await expect(sheet.locator('#rc-apply')).toHaveText('Apply 2 items, $11.47'); // 30.47 + 1.00 tax - 20.00
  await box.fill('abc');
  await expect(sheet.getByRole('alert')).toContainText('Rewards is dollars');
  await expect(nums).not.toContainText('You paid');
  await box.fill('500.00');
  await expect(sheet.getByRole('alert')).toContainText('cannot be more than the receipt total');
  await box.fill('');
  await expect(nums).not.toContainText('You paid');
  await expect(sheet.getByRole('alert')).toHaveCount(0);
});

test('no rewards line: the box is empty and You paid is not shown; typing covers a miss', async ({ page }) => {
  const sheet = await open(page, 0);
  await expect(sheet.getByLabel(/^Rewards/)).toHaveValue('');
  await expect(sheet.locator('.rcnums')).not.toContainText('You paid');
  await sheet.getByLabel(/^Rewards/).fill('2.50');
  await expect(sheet.locator('.rcnums')).toContainText('You paid $36.97');
});

test('Apply takes the credit off Spent, the Rewards box sits beside Tax and fixes it, and Undo puts it back', async ({ page }) => {
  const sheet = await open(page, 500);
  await sheet.locator('#rc-apply').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.click('#groc-view-bought');
  await expect(page.locator('#groc-summary')).toContainText('$26.47'); // 30.47 + 1.00 - 5.00
  const rewards = page.getByLabel(/^Rewards at .*dollars/);
  await expect(rewards).toHaveValue('5.00');
  await expect(page.getByLabel(/^Tax at .*dollars/)).toHaveValue('1.00');
  await rewards.fill('7.00'); await rewards.press('Enter');
  await expect(page.locator('#groc-summary')).toContainText('$24.47');
  await rewards.fill('x'); await rewards.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Rewards is dollars' })).toBeVisible();
  await expect(rewards).toHaveValue('7.00'); // nothing was written
  await rewards.fill(''); await rewards.press('Enter');
  await expect(page.locator('#groc-summary')).toContainText('$31.47'); // credit cleared
});

test('Undo after Apply takes the credit away again', async ({ page }) => {
  const sheet = await open(page, 500);
  await sheet.locator('#rc-apply').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#groc-summary')).toContainText('Bought 0 of 2');
  await page.click('#groc-view-bought');
  await expect(page.getByLabel(/^Rewards at /)).toHaveCount(0);
});

test('the numbers line has no accessibility violations and keeps 44 px on the Rewards box', async ({ page }) => {
  const sheet = await open(page, 500);
  const h = await sheet.getByLabel(/^Rewards/).evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
  const res = await new AxeBuilder({ page }).include('.rcsheet').analyze();
  expect(res.violations).toEqual([]);
});
