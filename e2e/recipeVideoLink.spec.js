import { test, expect } from './fixtures.js';

// Recipe video link (brief recipe-video-link). The address rule is a node test (recipes.test.ts); this covers the wiring: the field saves, the link shows
// on the recipe and opens in a new tab, a bad address is refused, and clearing the field removes the link.
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const start = async (page, url) => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('onion');
  if (url !== undefined) await page.getByLabel('Video link (optional)').fill(url);
};

test('a saved video link shows on the recipe and opens in a new tab', async ({ page }) => {
  await start(page, 'https://youtu.be/abc123');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const link = page.getByRole('link', { name: 'Watch on YouTube: Soup (opens in a new tab)' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://youtu.be/abc123');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('a recipe without a link shows no link', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: /Soup/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /opens in a new tab/ })).toHaveCount(0);
});

test('an address that is not a web link is refused', async ({ page }) => {
  await start(page, 'javascript:alert(1)');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByText('Video link should start with https://')).toBeVisible();
  await expect(page.getByLabel('Video link (optional)')).toBeVisible(); // still on the form
});

test('clearing the field removes the link; the link comes back in the form when editing', async ({ page }) => {
  await start(page, 'https://vimeo.com/1');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('link', { name: /Watch on Vimeo/ })).toBeVisible();
  await page.getByRole('button', { name: /^Edit/ }).first().click();
  await expect(page.getByLabel('Video link (optional)')).toHaveValue('https://vimeo.com/1');
  await page.getByLabel('Video link (optional)').fill('');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: /Soup/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /opens in a new tab/ })).toHaveCount(0);
});
