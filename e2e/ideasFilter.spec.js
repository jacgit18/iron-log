import { test, expect } from './fixtures.js';

// Ideas to try (Workout board): above six ideas a Status and a Muscle dropdown join the search. The pure rules are in experimentFilter.test.ts;
// this checks the wiring (the real dropdowns, the count, Clear, the reset when the list shrinks) and the row's fit on a phone and a tablet.
const IDEAS = [['hack', 'try light'], ['facepull', ''], ['latpd', ''], ['chestpress', 'slow'], ['bbrow', ''], ['dbcurl', ''], ['legcurl', '']];
const seed = page => page.addInitScript(items => {
  localStorage.setItem('ironlog:experiments/main', JSON.stringify({ schema: 1, items: items.map(([ex, note], i) => ({ id: 'E' + i, ex, ph: null, note })) }));
}, IDEAS);

test('Status and Muscle filter together with the search, the count follows, Clear resets, and a short list forgets them', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const cards = page.locator('.explist .expcard');
  const count = page.locator('.ifcount');
  await expect(cards).toHaveCount(7);
  await expect(count).toHaveText('7 ideas');
  await page.getByLabel('Muscle', { exact: true }).selectOption('quads'); // hack (quads) and nothing else
  await expect(cards).toHaveCount(1);
  await expect(count).toHaveText('1 of 7 ideas');
  await page.getByLabel('Status', { exact: true }).selectOption('onday'); // none is on a day yet
  await expect(page.locator('.explist')).toHaveCount(0);
  await expect(page.locator('.experiments')).toContainText('No idea matches. Clear the filters.');
  await page.getByLabel('Status', { exact: true }).selectOption('noday');
  await expect(cards).toHaveCount(1);
  await page.fill('#exp-q', 'zzz');
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear the search and filters' }).click();
  await expect(cards).toHaveCount(7);
  await expect(page.locator('#exp-q')).toHaveValue('');
  await expect(page.getByLabel('Muscle', { exact: true })).toHaveValue('');

  // A filter is forgotten when the list shrinks to six, so it does not come back set.
  await page.getByLabel('Muscle', { exact: true }).selectOption('quads');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: /^More actions for/ }).click();
  await cards.first().getByRole('button', { name: /delete/i }).click();
  await cards.first().getByRole('button', { name: /delete/i }).click();
  await expect(page.locator('.ideafilters')).toHaveCount(0);
  await expect(cards).toHaveCount(6);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cards).toHaveCount(7);
  await expect(page.getByLabel('Muscle', { exact: true })).toHaveValue('');

  // A new idea added with + Add idea goes last (the list is not re-sorted by the filters).
  await page.getByRole('button', { name: '+ Add idea' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: /Exercise/ }).fill('Zottman Curl Test');
  await page.getByRole('dialog').getByLabel(/^Note/).click(); // leaves the exercise box so its suggestions do not swallow the Save click
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(cards).toHaveCount(8);
  await expect(count).toHaveText('8 ideas');
  await expect(cards.last()).toContainText('Zottman Curl Test');
});

test('Never logged and a day this week are independent choices', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const cards = page.locator('.explist .expcard');
  await cards.first().getByRole('button', { name: /^Add /, exact: false }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Day 2', exact: true }).click();
  await page.getByLabel('Status', { exact: true }).selectOption('onday');
  await expect(cards).toHaveCount(1);
  await page.getByLabel('Status', { exact: true }).selectOption('noday');
  await expect(cards).toHaveCount(6);
  await page.getByLabel('Status', { exact: true }).selectOption('neverlogged'); // the one on Day 2 was never logged either
  await expect(cards).toHaveCount(7);
});

for (const width of [375, 768]) {
  test(`the filter row fits ${width}px: controls are 44px tall and the page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.goto('/');
    await page.getByLabel('Muscle', { exact: true }).selectOption('quads'); // shows the × and Clear as well
    for (const c of await page.locator('.ideafilters').locator('select, button, input').all()) {
      expect((await c.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
    }
    const bar = await page.locator('.ideafilters').boundingBox();
    expect(bar.x + bar.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
}
