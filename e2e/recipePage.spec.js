import { test, expect } from './fixtures.js';

// The recipe page's layout (brief recipe-page-layout): the log-or-plan control is fixed above the tab bar on a phone and an ordinary block under the title on a desktop; Edit and Delete sit behind More actions;
// the servings stepper hides behind "Scale the amounts". A fixed bar's position and what it covers need a real layout, so a node test cannot check them.
const long = Array.from({ length: 24 }, (_, i) => ({ amt: '1 cup', n: `ingredient ${i + 1}` }));
const stew = { id: 'stew', n: 'Long stew', cat: 'dinner', servings: 4, kcal: 400, p: 30, ing: long, steps: ['Cook it.', 'Eat it.'] };
const seed = async page => {
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, [stew]);
  await page.reload(); // the fixture has already loaded the page once
};
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); await page.locator('.rc-row', { hasText: 'Long stew' }).click(); await expect(page.locator('#rc-h')).toHaveText(/Long stew/); };
const box = (page, sel) => page.locator(sel).first().boundingBox();

test('on a phone the log control stays visible at the top and the bottom of the page and covers neither the last line nor the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await open(page);
  const bar = page.locator('.rc-logbar');
  await expect(bar).toBeVisible();
  expect(await bar.evaluate(e => getComputedStyle(e).position)).toBe('fixed');
  const inView = async () => { const b = await bar.boundingBox(); return b.y >= 0 && b.y + b.height <= 812; };
  expect(await inView()).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await inView()).toBe(true);
  const b = await bar.boundingBox(), tabs = await box(page, '#tab-daily');
  expect(b.y + b.height).toBeLessThanOrEqual(tabs.y + 1); // above the bottom navigation
  const last = await box(page, '.rc-steps li:last-child');
  expect(last.y + last.height).toBeLessThanOrEqual(b.y + 1); // the last line is not under the bar
});

test('at 1920px the control sits under the title and nothing on the page is fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page);
  await open(page);
  const bar = page.locator('.rc-logbar');
  expect(await bar.evaluate(e => getComputedStyle(e).position)).not.toBe('fixed');
  const title = await box(page, '#rc-h'), b = await bar.boundingBox();
  expect(b.y).toBeGreaterThan(title.y);
  expect(await page.locator('.rc-detail *').evaluateAll(els => els.filter(e => getComputedStyle(e).position === 'fixed').length)).toBe(0);
});

test('Edit and Delete are reached through More actions, and Delete still needs a second tap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page);
  await open(page);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete the recipe Long stew' }).click();
  await expect(page.locator('.rc-row', { hasText: 'Long stew' })).toHaveCount(0); // nothing happened yet: the page is still open
  await expect(page.getByRole('button', { name: 'Tap again to delete' })).toBeVisible();
  await page.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(page.locator('#rc-h')).toHaveCount(0);
});

test('the servings stepper stays hidden until Scale the amounts is tapped', async ({ page }) => {
  await seed(page);
  await open(page);
  await expect(page.getByRole('group', { name: 'Scale for tonight' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scale the amounts' }).click();
  await expect(page.getByRole('group', { name: 'Scale for tonight' })).toBeVisible();
  await page.getByRole('button', { name: 'More servings' }).click();
  await expect(page.getByText('5 servings', { exact: true })).toBeVisible();
  await expect(page.locator('.rc-ing').first()).toContainText('1¼');
});

test('a scaled recipe keeps its stepper in view, and Escape closes More actions', async ({ page }) => {
  await seed(page);
  await open(page);
  await page.getByRole('button', { name: 'Scale the amounts' }).click();
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'Scale the amounts' }).click(); // asked to hide it, but the amounts are scaled
  await expect(page.getByRole('button', { name: 'Reset to 4' })).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
});

test('on a phone the bar hides while an ingredient field has focus and comes back after', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(l => { localStorage.setItem('ironlog:grocery', JSON.stringify({ items: [{ id: 'g1', n: 'Flour', store: 'x' }] })); }, null);
  await seed(page);
  await open(page);
  await expect(page.locator('.rc-logbar')).toBeVisible();
  await page.locator('.rc-detail').evaluate(el => { const i = document.createElement('input'); i.id = 'probe'; el.querySelector('.rc-ings').appendChild(i); i.focus(); });
  await expect(page.locator('.rc-logbar')).toBeHidden();
  await page.locator('#probe').evaluate(i => i.blur());
  await expect(page.locator('.rc-logbar')).toBeVisible();
});

test('a ready-made food with numbers gets the same bar, and one without numbers gets none', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const rc = (id, n, extra) => ({ id, n, cat: 'ready', type: 'ingredient', ing: [], steps: [], ...extra });
  await page.addInitScript(l => { if (localStorage.getItem('ironlog:recipes/main') === null) localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })); }, [rc('a', 'Oat cereal', { kcal: 150, p: 5 }), rc('b', 'Mystery food', {})]);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.locator('.rc-row', { hasText: 'Oat cereal' }).click();
  await expect(page.locator('.rc-logbar')).toBeVisible();
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.locator('.rc-row', { hasText: 'Mystery food' }).click();
  await expect(page.locator('.rc-logbar')).toHaveCount(0);
});
