import { test, expect, seedExperiments, addIdeaToDay } from './fixtures.js';

// Ideas to try: an entry says which days of the viewed week it is already on, so Add twice is a choice and a card in another column is findable.
test('a workout experiment shows the days it was added to this week', async ({ page }) => {
  await page.goto('/');
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const card = page.locator('.explist .expcard');
  await expect(card.locator('.ideastatus')).toHaveText('Never logged');
  await addIdeaToDay(page, card, 1);
  await expect(card.locator('.ideastatus')).toHaveText('On Day 1');
  await addIdeaToDay(page, card, 2);
  await expect(card.locator('.ideastatus')).toHaveText('On Day 1, 2');
});

test('a workout experiment card moved to another day shows the day it is on now', async ({ page }) => {
  await page.goto('/');
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const entry = page.locator('.explist .expcard');
  const name = (await entry.locator('.rmname').innerText()).trim();
  await addIdeaToDay(page, entry, 1);
  await expect(entry.locator('.ideastatus')).toHaveText('On Day 1');
  const card = page.locator('#col-1 article.card').filter({ hasText: name }).first();
  const key = (await card.getByRole('button', { name: /^More actions:/ }).getAttribute('id')).replace('more-', '');
  await card.getByRole('button', { name: /^More actions:/ }).click();
  await page.locator(`#mv-${key}`).selectOption({ label: 'Day 3' });
  await expect(page.locator(`#col-3 #more-${key}`)).toHaveCount(1);
  await expect(entry.locator('.ideastatus')).toHaveText('On Day 3'); // where the card sits now, not where it was added
});

test('a stretch experiment shows the days it was added to this week', async ({ page }) => {
  await page.goto('/');
  await page.click('#board-stretches');
  await page.click('#sexp-add');
  await page.fill('#sexp-name', 'Frog Stretch');
  await page.keyboard.press('Enter');
  const card = page.locator('.explist .expcard');
  await expect(card.locator('.onday')).toHaveCount(0);
  await card.locator('select').selectOption('3');
  await card.getByRole('button', { name: 'Add Frog Stretch to Wednesday' }).click();
  await expect(card.locator('.onday')).toHaveText('On Wednesday this week');
});

test('dragging an idea card onto a board day adds it there', async ({ page }) => {
  await page.goto('/');
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  const entry = page.locator('.explist .expcard');
  const name = (await entry.locator('.rmname').innerText()).trim();
  const before = await page.locator('#col-4 article.card').filter({ hasText: name }).count();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await entry.dispatchEvent('dragstart', { dataTransfer: dt }); // the browser's own drag is not reliable under automation, so the events are sent
  await page.locator('#col-4').dispatchEvent('dragover', { dataTransfer: dt });
  await page.locator('#col-4').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.locator('#col-4 article.card').filter({ hasText: name })).toHaveCount(before + 1);
  await expect(entry.locator('.ideastatus')).toHaveText('On Day 4');
});
