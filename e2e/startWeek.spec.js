import { test, expect } from './fixtures.js';

// The fixture's clock is Thu 24 Sep 2026, so this week starts Sun 20 Sep.
test('the Program editor tags a card that starts in a later week, and the board leaves it out until then', async ({ page }) => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: '+ Add exercise', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: /Exercise/ }).fill('Farmer Carry Test');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const row = page.locator('.edpanel:not(.lib) .edrow', { hasText: 'Farmer Carry Test' });
  await expect(row).toBeVisible();
  await expect(row.locator('.tag')).not.toContainText('Starts'); // added to a day that is not finished: starts this week
  await page.click('#tab-board');
  await expect(page.getByRole('heading', { name: 'Farmer Carry Test' })).toHaveCount(1);
  await page.click('#tab-program');
  // Push its start to next week, as adding it to a finished day would.
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find(x => /^ironlog:programs\/[AB]$/.test(x));
    const p = JSON.parse(localStorage.getItem(k));
    p.days.forEach(d => d.slots.forEach(s => { if (s.from) s.from = '2026-09-27'; }));
    localStorage.setItem(k, JSON.stringify(p));
  });
  await page.reload(); await page.click('#tab-program');
  await expect(row.locator('.tag')).toContainText('Starts Sep 27');
  await page.click('#tab-board');
  await expect(page.getByRole('heading', { name: 'Farmer Carry Test' })).toHaveCount(0);
});
