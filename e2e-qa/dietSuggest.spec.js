import { expect, test } from '@playwright/test';
import { closeSheet, eaten, openAdd, openNutrition } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenario S-10 (Diet, on target): Quick add suggests what was eaten near this hour; tapping the first adds one portion and says so.
test('S-10: tapping the first suggestion adds that food and the notice says Added', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'diet-on-target');
  await openNutrition(page);
  await expect(eaten(page)).toHaveCount(3, { timeout: 30_000 });
  const sheet = await openAdd(page, 'Quick add');
  const first = sheet.getByRole('list', { name: 'Suggested now' }).getByRole('button').first();
  await expect(first).toBeVisible();
  const name = (await first.innerText()).split('\n')[0].split(' · ')[0].trim(); // the button reads "Salmon with potatoes · 694 kcal"
  await first.click();
  await expect(sheet.getByRole('status').last()).toHaveText(`Added ${name}.`);
  await closeSheet(page);
  await expect(eaten(page)).toHaveCount(4);
  await expect(eaten(page).filter({ hasText: name }).first()).toBeVisible();
  await context.close();
});
