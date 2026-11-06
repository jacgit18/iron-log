import { expect, test } from '@playwright/test';
import { signInAs } from './persona.js';

// QA scenario S-10 (Diet, on target): One-off food suggests what was eaten near this hour; tapping the first adds one portion and says so.
test('S-10: tapping the first suggestion adds that food and the notice says Added', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-on-target');
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  const diet = page.getByRole('region', { name: 'Diet' });
  await expect(diet.locator('.dt-entry')).toHaveCount(3, { timeout: 30_000 });
  await diet.getByRole('button', { name: 'Add one' }).click();
  const first = diet.locator('.dt-recents li button').first();
  await expect(first).toBeVisible();
  const name = (await first.innerText()).split('\n')[0].trim();
  await first.click();
  await expect(diet.locator('.dt-entry')).toHaveCount(4);
  await expect(page.getByText(/^Added /).first()).toBeVisible();
  expect(name.length).toBeGreaterThan(0);
  await context.close();
});
