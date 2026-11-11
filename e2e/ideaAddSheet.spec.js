import { test, expect, seedExperiments } from './fixtures.js';

// Ideas to try > Add: a day sheet. Its day list is read from the live board (swaps, rest days), which only a real board shows.
const add = (page) => page.locator('.explist .expcard').first().getByRole('button', { name: /^Add /, exact: false }).first().click();

test('the sheet is titled for the idea, marks the days it is on, and Undo takes out only the card it added', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ironlog:experiments/main', JSON.stringify({ schema: 1, items: [{ id: 'E0', ex: 'zercher', ph: 'hyp', note: 'try light' }] })));
  await page.goto('/');
  const card = page.locator('.explist .expcard').first(); // the card reads status, name, up to two muscle chips, the note, a Watch tile (Zercher has a video) and Add
  await expect(card.locator('.ideastatus')).toHaveText('Never logged');
  expect(await card.locator('.ideachip').count()).toBeGreaterThanOrEqual(1);
  expect(await card.locator('.ideachip').count()).toBeLessThanOrEqual(2);
  await expect(card.locator('.ideanote')).toHaveText('try light');
  await expect(card.locator('a.watch-large')).toHaveCount(1);
  await expect(card.getByRole('button', { name: /^Add / })).toBeVisible();
  const name = (await page.locator('.explist .rmname').first().innerText()).trim();
  const inCol3 = page.locator('#col-3 article.card').filter({ hasText: name });
  const before = await inCol3.count();
  await add(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: /^Add / })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'This week only' })).toHaveAttribute('aria-pressed', 'true');
  expect(await sheet.locator('.iaday').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual([1, 2, 3, 4, 5, 6, 7].map(n => `Day ${n}`)); // the Board's order
  await sheet.getByRole('button', { name: 'Day 3', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const notice = page.locator('.removednote');
  await expect(notice).toContainText('Added');
  await expect(notice).toContainText('to Day 3 this week');
  await expect(inCol3).toHaveCount(before + 1);
  await expect(page.locator('.ideastatus')).toHaveText('On Day 3');
  await add(page);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Day 3', exact: true })).toContainText('On');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(inCol3).toHaveCount(before);
  await expect(page.locator('.ideastatus')).toHaveText('Never logged');
  await expect(page.locator('.explist .expcard')).toHaveCount(1); // the idea stays on the list
});

test('a rest day is left out and today is marked on the current week', async ({ page }) => {
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  await page.locator('#rest-3').check();
  await add(page);
  const days = page.getByRole('dialog').locator('.iaday');
  await expect(days).toHaveCount(6);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Day 3', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('.iaday.today')).toHaveCount(1); // the viewed week is the current one
});

test('Every week (program) opens the add-to-program sheet and the idea leaves the list when saved', async ({ page }) => {
  await seedExperiments(page, ['hack']);
  await page.goto('/');
  await add(page);
  await page.getByRole('button', { name: 'Every week (program)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Day 2', exact: true }).click();
  await expect(page.locator('#slot-ex-0')).toBeVisible();
});
