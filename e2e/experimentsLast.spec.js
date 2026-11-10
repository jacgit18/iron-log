import { test, expect, seedExperiments, addIdeaToDay } from './fixtures.js';

// Experiments: "Last: ..." is the last session you logged. Ticking an experiment's card off writes an automatic entry (a weight never lifted), which must not show there (#382 fixed the Card and the Log sheet; the Experiments list was missed).
test('an experiment ticked off as a card does not show a Last weight it never had', async ({ page }) => {
  await page.goto('/');
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const entry = page.locator('.explist .expcard');
  const name = (await entry.locator('.rmname').innerText()).trim();
  await addIdeaToDay(page, entry, 1);
  await expect(entry.locator('.ideastatus')).toHaveText('On Day 1');
  const card = page.locator('#col-1 article.card').filter({ hasText: name }).first();
  await card.locator('input.chk').click();
  await expect(card).toHaveCount(0); // ticked: the card folds into the Finished bar
  await expect(entry.locator('.lastlog')).toHaveCount(0);
});
