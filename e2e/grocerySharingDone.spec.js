import { test, expect } from './fixtures.js';

// A Done button at the bottom of the Sharing panel (At home) closes it, after adding a group or person that was typed but not added yet.
// The fixed date is in September 2026.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const ITEMS = { stores: ["BJ's"], items: [item('tp', 'Toilet paper', "BJ's", 2499)] };
const GROUP = { id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] };

const open = async page => {
  await page.evaluate(({ ITEMS, GROUP }) => {
    localStorage.setItem('ironlog:grocery/main', JSON.stringify({ ...ITEMS, groups: [GROUP] }));
  }, { ITEMS, GROUP });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-home');
  await page.click('#groc-sharing');
};
const panel = page => page.getByRole('region', { name: 'Sharing' });

test('Done closes the panel, says Sharing saved, and puts focus back on the Sharing button', async ({ page }) => {
  await open(page);
  await expect(panel(page)).toBeVisible();
  await page.click('#groc-sharing-done');
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Sharing saved.' })).toBeVisible();
  await expect(page.locator('#groc-sharing')).toBeFocused();
  await page.click('#groc-sharing');
  await expect(page.getByRole('status').filter({ hasText: 'Sharing saved.' })).toHaveCount(0); // gone once the panel is open again
});

test('a person typed in a group and not added yet is added by Done', async ({ page }) => {
  await open(page);
  await page.getByLabel('New person in Costco run').fill('Mom');
  await page.click('#groc-sharing-done');
  await expect(panel(page)).toHaveCount(0);
  await page.click('#groc-sharing');
  await expect(panel(page).getByText('Mom', { exact: true })).toBeVisible();
});

test('a new group typed and not added yet is added by Done', async ({ page }) => {
  await open(page);
  await page.getByLabel('New group', { exact: true }).fill('Pals');
  await page.getByLabel('People in the new group, separated by commas').fill('Bo');
  await page.click('#groc-sharing-done');
  await expect(panel(page)).toHaveCount(0);
  await page.click('#groc-sharing');
  await expect(panel(page).getByLabel('Name of the group Pals')).toBeVisible();
});

test('typed text that cannot be added keeps the panel open and says why', async ({ page }) => {
  await open(page);
  await page.getByLabel('New person in Costco run').fill('Sister');
  await page.click('#groc-sharing-done');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('alert')).toContainText('That person is already in this group.');
  await expect(page.getByRole('status').filter({ hasText: 'Sharing saved.' })).toHaveCount(0);
});
