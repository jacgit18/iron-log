import { test, expect } from './fixtures.js';

// Experiments: a list longer than six entries gets a search over name and note; a short one does not.
const WORKOUT = [['hack', 'try light'], ['facepull', ''], ['latpd', ''], ['chestpress', 'slow'], ['bbrow', ''], ['dbcurl', ''], ['legcurl', '']];

test('the workout Experiments list gets a search once it is long', async ({ page }) => {
  await page.addInitScript(items => {
    localStorage.setItem('ironlog:experiments/main', JSON.stringify({ schema: 1, items: items.map(([ex, note], i) => ({ id: 'E' + i, ex, ph: null, note })) }));
  }, WORKOUT.slice(0, 6));
  await page.goto('/');
  await expect(page.locator('.explist .expcard')).toHaveCount(6);
  await expect(page.locator('#exp-q')).toHaveCount(0);
});

test('searching narrows the long workout list by name or note, and says when nothing matches', async ({ page }) => {
  await page.addInitScript(items => {
    localStorage.setItem('ironlog:experiments/main', JSON.stringify({ schema: 1, items: items.map(([ex, note], i) => ({ id: 'E' + i, ex, ph: null, note })) }));
  }, WORKOUT);
  await page.goto('/');
  const cards = page.locator('.explist .expcard');
  await expect(cards).toHaveCount(7);
  await page.fill('#exp-q', 'slow'); // a note
  await expect(cards).toHaveCount(1);
  await expect(page.locator('.experiments [role=status]')).toContainText('1 of 7 exercises');
  await page.fill('#exp-q', 'zzz');
  await expect(cards).toHaveCount(0);
  await expect(page.locator('.experiments')).toContainText('No exercise matches');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(cards).toHaveCount(7);
});

test('the Stretches Experiments list searches too', async ({ page }) => {
  await page.addInitScript(() => {
    const items = ['Frog', 'Cossack', 'Pigeon', 'Lizard', 'Butterfly', 'Dragon', 'Child'].map((n, i) => ({ id: 'SE' + i, n: n + ' Stretch', ...(n === 'Child' ? { note: 'knees wide' } : {}) }));
    localStorage.setItem('ironlog:stretches/main', JSON.stringify({ items: [], experiments: items }));
  });
  await page.goto('/');
  await page.click('#board-stretches');
  const cards = page.locator('.explist .expcard');
  await expect(cards).toHaveCount(7);
  await page.fill('#sexp-q', 'knees');
  await expect(cards).toHaveCount(1);
  await page.fill('#sexp-q', 'dragon');
  await expect(cards).toHaveCount(1);
});
