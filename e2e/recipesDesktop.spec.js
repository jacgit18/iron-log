import { test, expect } from './fixtures.js';
import { startFood, startRecipe } from './recipesNav.js';

// The recipe page and the recipe and food forms on a laptop or desktop (brief recipes-desktop-layouts, 2a). Column positions and widths need a real layout,
// so a node test cannot check them. The list beside the pane (2b) has its own checks.
const ing = Array.from({ length: 8 }, (_, i) => ({ amt: '1 cup', n: `ingredient ${i + 1}` }));
const longStep = 'Stir the pot slowly and keep stirring while the sauce thickens, then take it off the heat and let it rest for ten minutes before you taste it and add salt. '.repeat(3);
const stew = { id: 'stew', n: 'Long stew', cat: 'dinner', servings: 4, kcal: 400, p: 30, ing, steps: [longStep, 'Eat it.'], note: longStep };
const seed = async page => {
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, [stew]);
  await page.reload(); // the fixture has already loaded the page once
};
const openStew = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await page.locator('.rc-row', { hasText: 'Long stew' }).click(); await expect(page.locator('#rc-h')).toHaveText(/Long stew/); };
const box = (page, sel) => page.locator(sel).first().boundingBox();

for (const width of [1024, 1280, 1920]) {
  test(`at ${width}px the recipe page puts ingredients beside the steps, caps steps and notes, and keeps the day field narrow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await seed(page);
    await openStew(page);
    const ings = await box(page, '.rc-col:first-child .rc-ings'), steps = await box(page, '.rc-steps');
    expect(steps.x).toBeGreaterThan(ings.x + ings.width - 1); // the steps column starts where the ingredients column ends
    expect(Math.abs((await box(page, '.rc-col:last-child h3')).y - (await box(page, '.rc-col:first-child h3')).y)).toBeLessThan(12); // side by side, not stacked
    expect((await box(page, '.lc input[type="date"]')).width).toBeLessThan(360);
    const cap = await page.locator('.rc-steps li').first().evaluate(e => e.getBoundingClientRect().width);
    expect(cap).toBeLessThanOrEqual(70 * 12); // 70 characters of this font are well under 12 px each
    const note = await page.locator('.rc-detail > .note', { hasText: 'Stir the pot' }).first().evaluate(e => e.getBoundingClientRect().width);
    expect(note).toBeLessThanOrEqual(70 * 12);
  });
}

test('a phone and the detail pane keep the recipe in one column', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await openStew(page);
  expect((await box(page, '.rc-steps')).y).toBeGreaterThan((await box(page, '.rc-ings')).y); // steps under the ingredients
});

test('at 1920px the recipe form has Nutrition beside the basics and no column wider than 900px; at 375px every form row is one column', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.click('#tab-daily'); await page.click('#daily-recipes'); await startRecipe(page);
  const basics = await box(page, '.rcf-sec:has(#rcf-btn-basics)'), nut = await box(page, '.rcf-sec:has(#rcf-btn-nut)');
  expect(nut.x).toBeGreaterThan(basics.x + basics.width - 1);
  expect(Math.abs(nut.y - basics.y)).toBeLessThan(5);
  for (const w of await page.locator('.rcf-col').evaluateAll(els => els.map(e => e.getBoundingClientRect().width))) expect(w).toBeLessThanOrEqual(900);
  await page.setViewportSize({ width: 375, height: 812 });
  const cols = async sel => page.locator(sel).first().evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  expect(await cols('.rc-meta')).toBe(1);
  expect(await cols('.rc-nutfields')).toBe(1);
  const x = await page.locator('.rc-ingline .rc-name').first().boundingBox(), amt = await box(page, '.rc-ingline .rc-amt');
  expect(x.y).toBeGreaterThan(amt.y + amt.height - 1); // the name is under the amount, not beside it
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the ready-made food form has two columns at 1920px and one at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.click('#tab-daily'); await page.click('#daily-recipes'); await startFood(page);
  const name = await box(page, '.rcf-col:first-child label'), amounts = await box(page, '.rcf-col:last-child label');
  expect(amounts.x).toBeGreaterThan(name.x + name.width - 1);
  await page.setViewportSize({ width: 375, height: 812 });
  const kcal = await box(page, '.rc-nutfields label'), pack = await box(page, '.rcf-col:last-child label');
  expect(Math.abs(kcal.x - pack.x)).toBeLessThan(2); // one column: the same left edge
});
