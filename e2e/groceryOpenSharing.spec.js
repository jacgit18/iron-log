import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Reaching grocery sharing (ADR 059) without Edit: a Sharing button beside Edit on At home opens the groups panel above the list, and
// a one-line prompt offers it until a group exists. The fixed date is in September 2026.
const item = (id, n, store, cents) => ({ id, n, store, qty: 1, cents, every: true, out: false });
const ITEMS = { stores: ["BJ's"], items: [item('tp', 'Toilet paper', "BJ's", 2499)] };
const GROUP = { id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }], stores: ["BJ's"] };

const open = async (page, { admin = true, group = false } = {}) => {
  await page.evaluate(({ admin, group, ITEMS, GROUP }) => {
    if (admin) localStorage.setItem('ironlog:session/admin', 'true');
    localStorage.setItem('ironlog:grocery/main', JSON.stringify(group ? { ...ITEMS, groups: [GROUP] } : ITEMS));
  }, { admin, group, ITEMS, GROUP });
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery'); await page.click('#groc-view-home');
};
const panel = page => page.getByRole('region', { name: 'Sharing' });

test('with no group, a prompt and the Sharing button open the groups panel without Edit, and the prompt goes once a group exists', async ({ page }) => {
  await open(page);
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('.gshareprompt')).toContainText('Buy groceries with other people?');
  await page.click('#groc-sharing-prompt');
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#groc-sharing-h')).toBeFocused(); // the prompt button is gone, so focus lands on the panel's heading
  await expect(page.locator('#groc-edit')).toHaveAttribute('aria-pressed', 'false'); // not in Edit mode
  await expect(page.locator('.gshareprompt')).toHaveCount(0);
  await page.getByLabel('New group', { exact: true }).fill('Home');
  await page.getByRole('button', { name: 'Add group' }).click();
  await page.click('#groc-sharing'); // Close sharing
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('.gshareprompt')).toHaveCount(0); // a group exists
});

test('with a group the Sharing button still opens and closes the panel, and the panel has no accessibility violations', async ({ page }) => {
  await open(page, { group: true });
  await expect(page.locator('.gshareprompt')).toHaveCount(0);
  await page.click('#groc-sharing');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByLabel('Name of the group Costco run')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.click('#groc-sharing');
  await expect(panel(page)).toHaveCount(0);
});

test('an account that is not an admin gets the button and the prompt too', async ({ page }) => {
  await open(page, { admin: false });
  await expect(page.locator('#groc-sharing')).toHaveCount(1);
  await expect(page.locator('.gshareprompt')).toHaveCount(1);
});
