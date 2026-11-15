import { expect, test } from '@playwright/test';
import { dayCol, openNutrition, todayCol } from './nutritionBoard.js';
import { signInAs } from './persona.js';

// QA scenarios S-08 and S-09 (Meal planner): ticking today's planned items logs them and a later day has no check box; Nutrition has no grocery button, and a
// recipe's own Add missing to Shopping adds each missing ingredient once and a second press adds nothing.
test('S-08: ticking the plan logs it, and a later day has no check box', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'meal-planner');
  await openNutrition(page);
  const today = todayCol(page);
  const ticks = today.getByRole('checkbox', { name: /^Check .* as eaten$/ });
  await expect(ticks.first()).toBeVisible({ timeout: 30_000 });
  const n = await ticks.count();
  expect(n).toBeGreaterThan(0); // today plans at least one recipe or meal
  for (let i = 0; i < n; i++) { // each tick turns that box into "Uncheck <name> as eaten", so the first unticked one is always the next
    const box = ticks.first();
    const name = (await box.getAttribute('aria-label')).replace(/^Check /, '').replace(/ as eaten$/, '');
    await box.click();
    await expect(today.getByRole('checkbox', { name: `Uncheck ${name} as eaten` })).toBeChecked();
    await expect(page.locator('.nb-msg')).toContainText(/^Added \d+ from /);
  }
  await expect(ticks).toHaveCount(0);
  const later = dayCol(page, '2026-09-25');
  await expect(later.locator('.wb-card').first()).toBeVisible(); // the day after is planned, so it has cards, but nothing to tick
  await later.locator('.wb-card').first().click();
  await expect(later.getByRole('checkbox', { name: / as eaten$/ })).toHaveCount(0);
  await context.close();
});

test('S-09: Nutrition has no grocery button; a recipe adds its missing ingredients to Shopping once', async ({ browser }) => {
  const { context, page } = await signInAs(browser, 'meal-planner');
  await openNutrition(page);
  await expect(page.getByRole('button', { name: 'Add missing ingredients to Shopping' })).toHaveCount(0);
  const shoppingRows = async () => { await page.click('#daily-grocery'); await page.click('#groc-view-shopping'); return page.locator('.gget').count(); };
  const before = await shoppingRows();
  await page.click('#daily-recipes');
  await page.getByText('Overnight oats', { exact: true }).first().click();
  const add = page.getByRole('button', { name: /^Add (\d+ )?missing to Shopping$/ });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await add.click();
  await expect(page.getByText(/^Added \d+ to Shopping\./)).toBeVisible();
  const added = Number((await page.getByText(/^Added \d+ to Shopping\./).innerText()).match(/Added (\d+)/)[1]);
  expect(added).toBeGreaterThan(0);
  expect(await shoppingRows()).toBe(before + added);
  await page.click('#daily-recipes');
  await page.getByText('Overnight oats', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Add missing to Shopping' }).click();
  await expect(page.getByText(/\d+ (is|are) on Shopping already\./)).toBeVisible();
  expect(await shoppingRows()).toBe(before + added);
  await context.close();
});
