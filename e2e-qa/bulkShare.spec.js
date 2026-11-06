import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-85 (Grocery shopper): select all in Costco, share with Sam only, then Undo. Nothing changes until Apply; every Costco row goes from
// "Me +2" to "Me +1"; the notice names the count; Undo puts the rows back.
test('S-85: select all in Costco, share with Sam, and Undo', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'grocery-shopper');
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
  const tags = text => page.locator('.gget .gsplittag', { hasText: new RegExp(`^${text}$`) });
  await expect(tags('Me \\+2').first()).toBeVisible({ timeout: 30_000 });
  const before = { one: await tags('Me \\+1').count(), two: await tags('Me \\+2').count() };
  await page.click('#groc-select');
  await expect(page.locator('#groc-select-share')).toBeDisabled();
  await page.getByRole('button', { name: 'Select all in Costco' }).click();
  const bar = page.getByRole('region', { name: 'Selected items' });
  await expect(bar).toContainText(/\d+ selected/);
  const n = Number((await bar.innerText()).match(/(\d+) selected/)[1]);
  expect(n).toBeGreaterThan(0);
  await page.click('#groc-select-share');
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Sam').check();
  expect(await tags('Me \\+1').count()).toBe(before.one); // nothing changes until Apply
  await page.click('#bs-apply');
  await expect(page.getByText(new RegExp(`Shared ${n} items?: Me \\+1\\.`))).toBeVisible();
  await expect(page.locator('#groc-select')).toBeFocused();
  await expect(tags('Me \\+1')).toHaveCount(before.one + n);
  await expect(tags('Me \\+2')).toHaveCount(before.two - n);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(tags('Me \\+1')).toHaveCount(before.one);
  await expect(tags('Me \\+2')).toHaveCount(before.two);
  await context.close();
});
