import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Create a program: pick a start (a starter, a copy of A or B, a blank program), name it, then choose what happens next (Load into A or B, or Not yet).
// What a unit test cannot see: the sheet's two steps, the days-a-week choice appearing only for a starter, and the Board's program really changing on Load.
const openCreate = async page => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await page.getByRole('button', { name: 'Create a program' }).click();
  await expect(page.getByRole('heading', { name: 'Create a program' })).toBeVisible();
};
const name = page => page.getByLabel('Name');

test('offers the four starters, two copies and a blank program, with days a week only where there is a choice', async ({ page }) => {
  await openCreate(page);
  await expect(page.locator('input[name=np-start]')).toHaveCount(7);
  await expect(name(page)).toHaveValue('Push / Pull / Legs · 3 days');
  await page.getByLabel('Days a week').selectOption('6');
  await expect(name(page)).toHaveValue('Push / Pull / Legs · 6 days');
  await page.getByRole('radio', { name: /5 × 5/ }).check();
  await expect(page.getByLabel('Days a week')).toHaveCount(0); // 5 × 5 offers only 3
  await page.getByRole('radio', { name: /A copy of/ }).first().check();
  await expect(page.getByLabel('Days a week')).toHaveCount(0);
  await expect(name(page)).toHaveValue(/^Copy of /);
  await name(page).fill('Mine');
  await page.getByRole('radio', { name: /blank/i }).check();
  await expect(name(page)).toHaveValue('Mine'); // a name you typed stays
});

test('a name is required, and Cancel changes nothing', async ({ page }) => {
  await openCreate(page);
  await name(page).fill('  ');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Give the program a name.');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Create a program' })).toHaveCount(0);
  await expect(page.locator('.lib .edrow')).toHaveCount(0);
});

test('Not yet keeps a starter in the library and opens it with its cards, leaving A and B alone', async ({ page }) => {
  await openCreate(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Push / Pull / Legs · 3 days is ready' })).toBeVisible();
  await page.getByRole('button', { name: /^Not yet/ }).click();
  await expect(page.locator('#ed-title')).toContainText('Push / Pull / Legs · 3 days');
  await expect(page.locator('.edrow').first()).toBeVisible(); // Day 1 has the starter's cards
  await page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Program A' }).click();
  await expect(page.locator('.lib .edrow', { hasText: 'Push / Pull / Legs · 3 days' })).toBeVisible();
});

test('Load into Program A puts the new program on the Board', async ({ page }) => {
  await openCreate(page);
  await page.getByRole('radio', { name: /Full body/ }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const loadA = page.locator('.npnext').getByRole('button', { name: /^Load into Program A/ });
  await expect(loadA).toContainText('nothing needs saving');
  await loadA.click();
  await expect(page.getByRole('heading', { name: /is ready/ })).toHaveCount(0);
  await expect(page.locator('#ed-title')).toContainText('Full body · 3 days');
  await expect(page.getByRole('group', { name: 'Program to edit' }).getByRole('button', { name: 'Full body · 3 days' })).toHaveAttribute('aria-pressed', 'true');
  await page.click('#tab-board');
  await expect(page.getByText('Romanian deadlift').first()).toBeVisible();
});

test('the two steps fit a phone at large text, with 44px buttons', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await openCreate(page);
  const fit = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, w: innerWidth }));
  const m1 = await fit(); expect(m1.scroll).toBeLessThanOrEqual(m1.w);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const btns = await page.locator('.npnext .btn').evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
  expect(btns).toHaveLength(3);
  for (const h of btns) expect(h).toBeGreaterThanOrEqual(44);
  const m2 = await fit(); expect(m2.scroll).toBeLessThanOrEqual(m2.w);
});

test('both steps have no accessibility violations', async ({ page }) => {
  const scan = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze().then(r => r.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`));
  await openCreate(page);
  expect(await scan()).toEqual([]);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.npnext')).toBeVisible();
  expect(await scan()).toEqual([]);
});
