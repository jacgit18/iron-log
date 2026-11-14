import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';
import { startRecipe, unfoldAll } from './recipesNav.js';

// A meal's vitamin and mineral bars (brief meal-micro-breakdown). The sums, the at-least rule, the Other segment and the match with the stored
// roll-up are node tests (mealMicroBreakdown.test.ts); this covers the wiring and layout they cannot see: the collapsed line, the live bars in
// the meal form, the meal's page, the own-numbers switch, and phone and desktop width.
const rc = (id, n, cat, extra = {}) => ({ id, n, cat, ing: [], steps: [], ...extra });
const cereal = rc('cereal', 'Oat cereal', 'ready', { type: 'ingredient', kcal: 150, p: 5, micro: { calcium: 100, vitaminD: 1, iron: 8 } });
const milk = rc('milk', 'Whole milk', 'ready', { type: 'drink', kcal: 150, p: 8, micro: { calcium: 300, vitaminD: 2.9, vitaminA: 140 } });
const bowl = rc('bowl', 'Cereal bowl', 'breakfast', { kcal: 300, p: 13, ing: [{ n: 'Oat cereal', rid: 'cereal', q: 1 }, { n: 'Whole milk', rid: 'milk', q: 1 }] });
const seed = async (page, list) => {
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, list);
  await page.reload(); // the fixture has already loaded the page once
};
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const openBowl = async page => {
  await openRecipes(page);
  await page.getByRole('button', { name: /Cereal bowl/ }).first().click();
};

test('the meal form shows its vitamins live: collapsed first, then a bar per nutrient that follows the amounts', async ({ page }) => {
  await seed(page, [cereal, milk]);
  await openRecipes(page);
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Cereal bowl');
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  await page.getByRole('group', { name: 'Foods and meals' }).getByRole('button', { name: /Oat cereal/ }).click();
  await expect(page.locator('.rc-roll .mmb-toggle')).toHaveText('Vitamins and minerals: 3 listed'); // one food so far: calcium, vitamin D, iron
  await page.getByRole('button', { name: '+ Food or meal' }).click();
  await page.getByRole('group', { name: 'Foods and meals' }).getByRole('button', { name: /Whole milk/ }).click();
  const toggle = page.locator('.rc-roll .mmb-toggle');
  await expect(toggle).toHaveText('Vitamins and minerals: 4 listed');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.rc-roll .mmb-row')).toHaveCount(0); // collapsed: no bars
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const calcium = page.locator('.rc-roll .mmb-row', { hasText: 'Calcium' });
  await expect(calcium.locator('.mmb-val')).toHaveText('400 mg');
  await expect(calcium.locator('.mmb-seg')).toHaveText(['100', '300']);
  await expect(calcium.locator('.mmb-track')).toHaveAttribute('aria-label', 'Calcium per serving: Oat cereal 100 mg, Whole milk 300 mg. Total 400 mg.');
  const iron = page.locator('.rc-roll .mmb-row', { hasText: 'Iron' });
  await expect(iron.locator('.mmb-val')).toContainText('≥ 8 mg');
  await expect(iron.locator('.mmb-val')).toContainText('at least');
  await expect(iron.locator('.mmb-unk')).toHaveText('not listed');
  await page.getByRole('button', { name: 'More Whole milk' }).click(); // 1.5 portions of milk: 100 + 450
  await expect(calcium.locator('.mmb-val')).toHaveText('550 mg');
  await expect(calcium.locator('.mmb-seg')).toHaveText(['100', '450']);
  await toggle.click();
  await expect(page.locator('.rc-roll .mmb-row')).toHaveCount(0); // closes again
});

test('the meal page has the same section, collapsed, and it goes when the meal uses its own numbers', async ({ page }) => {
  await seed(page, [cereal, milk, bowl]);
  await openBowl(page);
  const toggle = page.locator('.mmb-toggle');
  await expect(toggle).toHaveText('Vitamins and minerals: 4 listed');
  await toggle.click();
  await expect(page.locator('.mmb-row', { hasText: 'Calcium' }).locator('.mmb-val')).toHaveText('400 mg');
  await expect(page.locator('.mmb-row', { hasText: 'Vitamin A' }).locator('.mmb-val')).toContainText('≥ 140 mcg');
  await expect(page.locator('.mmb-warn')).toContainText('At least');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await unfoldAll(page);
  await page.getByLabel('Use my own numbers').check();
  await expect(page.locator('.mmb')).toHaveCount(0);
  await page.getByLabel('Use my own numbers').uncheck();
  await expect(page.locator('.rc-roll .mmb-toggle')).toBeVisible();
});

test('a recipe with no linked parts, and a meal whose foods list no vitamins, show no section', async ({ page }) => {
  const bare = rc('bare', 'Mystery food', 'ready', { type: 'ingredient', kcal: 100, p: 4 });
  const plain = rc('plain', 'Plain eggs', 'breakfast', { ing: [{ n: 'Eggs', amt: '2' }] });
  const bareMeal = rc('baremeal', 'Bare meal', 'breakfast', { ing: [{ n: 'Mystery food', rid: 'bare', q: 1 }] });
  await seed(page, [bare, plain, bareMeal]);
  await openRecipes(page);
  await page.getByRole('button', { name: /Plain eggs/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Plain eggs' })).toBeVisible();
  await expect(page.locator('.mmb')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.getByRole('button', { name: /Bare meal/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Bare meal' })).toBeVisible();
  await expect(page.locator('.mmb')).toHaveCount(0);
});

for (const [label, size] of [['phone', { width: 360, height: 800 }], ['desktop', { width: 1440, height: 900 }]]) {
  test(`the bars fit and pass axe on a ${label}, with five foods and an Other segment`, async ({ page }) => {
    const foods = Array.from({ length: 7 }, (_, i) => rc(`f${i}`, `Food number ${i + 1}`, 'ready', { type: 'ingredient', kcal: 100, p: 3, micro: { calcium: 10 * (i + 1), ...(i < 6 ? { iron: 1 + i } : {}) } }));
    const big = rc('big', 'Big plate', 'dinner', { kcal: 700, p: 21, ing: foods.map(f => ({ n: f.n, rid: f.id, q: 1 })) });
    await page.setViewportSize(size);
    await seed(page, [...foods, big]);
    await openRecipes(page);
    await page.getByRole('button', { name: /Big plate/ }).first().click();
    await page.locator('.mmb-toggle').click();
    const calcium = page.locator('.mmb-row', { hasText: 'Calcium' });
    await expect(calcium.locator('.mmb-seg')).toHaveCount(6); // five foods and Other
    await expect(calcium.locator('.mmb-sother')).toHaveText('130'); // 60 + 70
    await expect(page.locator('.mmb-legend li')).toHaveText(['Food number 1', 'Food number 2', 'Food number 3', 'Food number 4', 'Food number 5', 'Other']);
    const iron = page.locator('.mmb-row', { hasText: 'Iron' });
    await expect(iron.locator('.mmb-sother')).toHaveText('6'); // the sixth food lists iron (1+5), the seventh does not: Other holds what is listed
    await expect(iron.locator('.mmb-val')).toContainText('at least');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const track = await calcium.locator('.mmb-track').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(track).toBeLessThanOrEqual(0); // no segment pushes the bar wider than its row
    const { violations } = await new AxeBuilder({ page }).include('.mmb').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations).toEqual([]);
  });
}

test('a bar whose amounts are all under 1 still fills its row', async ({ page }) => {
  const a = rc('a', 'Oat cereal', 'ready', { type: 'ingredient', kcal: 150, p: 5, micro: { thiamin: 0.4, riboflavin: 0.1 } });
  const b = rc('b', 'Whole milk', 'ready', { type: 'drink', kcal: 150, p: 8, micro: { thiamin: 0.45, riboflavin: 0.05 } });
  const m = rc('m', 'Small bowl', 'breakfast', { kcal: 300, p: 13, ing: [{ n: 'Oat cereal', rid: 'a', q: 1 }, { n: 'Whole milk', rid: 'b', q: 1 }] });
  await seed(page, [a, b, m]);
  await openRecipes(page);
  await page.getByRole('button', { name: /Small bowl/ }).first().click();
  await page.locator('.mmb-toggle').click();
  for (const name of ['Thiamin', 'Riboflavin']) {
    const track = page.locator('.mmb-row', { hasText: name }).locator('.mmb-track');
    const gap = await track.evaluate(el => {
      const segs = [...el.children], used = segs.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0);
      return el.clientWidth - used - (segs.length - 1) * parseFloat(getComputedStyle(el).columnGap); // what is left empty at the end of the bar
    });
    expect(Math.abs(gap)).toBeLessThan(1);
  }
  await expect(page.locator('.mmb-row', { hasText: 'Thiamin' }).locator('.mmb-val')).toHaveText('0.85 mg');
});

test('the bars pass axe in the dark theme too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(page, [cereal, milk, bowl]);
  await openBowl(page);
  await page.locator('.mmb-toggle').click();
  const { violations } = await new AxeBuilder({ page }).include('.mmb').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations).toEqual([]);
});
