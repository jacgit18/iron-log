import { test, expect } from './fixtures.js';

// A link shared from another Android app (manifest share_target, brief share-target). The address reading is a node test (shareTarget.test.ts);
// this covers the wiring: the manifest entry, the sheet opening over the board, the address cleaned, Back closing it, and each way of saving the link.
const share = (page, query) => page.goto(`/?${query}`);
const YT = 'https%3A%2F%2Fyoutu.be%2Fabc123';

test('the manifest lists the app as a share target', async ({ page }) => {
  const m = await (await page.request.get('/manifest.webmanifest')).json();
  expect(m.share_target).toEqual({ action: './', method: 'GET', params: { title: 'share_title', text: 'share_text', url: 'share_url' } });
});

test('a shared link opens the sheet, the address is cleaned, and Back closes it', async ({ page }) => {
  await share(page, `share_title=Leg%20day&share_url=${YT}`);
  await expect(page.getByRole('heading', { name: 'Save this link' })).toBeVisible();
  await expect(page.getByText('https://youtu.be/abc123')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await page.evaluate(() => { window.__sameDocument = true; });
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Save this link' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true); // Back closed the sheet, it did not leave the app
  await expect(page.locator('#tab-board')).toBeVisible();
});

test('a share with no web link says so', async ({ page }) => {
  await share(page, 'share_text=just%20words');
  await expect(page.getByText('No web link found in what you shared.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Save this link' })).toHaveCount(0);
});

test('Exercise: the link becomes the exercise video link; a different one asks before replacing', async ({ page }) => {
  await share(page, `share_url=${YT}`);
  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByLabel('Find an exercise').fill('lat pulldown');
  await page.getByRole('button', { name: /^Lat Pulldown/ }).first().click();
  await expect(page.getByText(/Saved as the video link for Lat Pulldown/)).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: /^Watch on YouTube: Lat Pulldown/ }).first()).toHaveAttribute('href', 'https://youtu.be/abc123');
  await share(page, 'share_url=https%3A%2F%2Fvimeo.com%2F42');
  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByLabel('Find an exercise').fill('lat pulldown');
  await page.getByRole('button', { name: /^Lat Pulldown/ }).first().click();
  await expect(page.getByText(/Replace the link on Lat Pulldown/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('link', { name: /^Watch on Vimeo: Lat Pulldown/ }).first()).toBeVisible();
});

test('Recipe: add the link to one of yours, or start a new recipe with it', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('onion');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await share(page, `share_title=Best%20stew&share_url=${YT}`);
  await page.getByRole('button', { name: 'Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Soup' }).click();
  await expect(page.getByText('Saved as the video link for Soup.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await share(page, `share_title=Best%20stew&share_url=${YT}`);
  await page.getByRole('button', { name: 'Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'New recipe with this link' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Best stew');
  await expect(page.getByLabel('Video link (optional)')).toHaveValue('https://youtu.be/abc123');
});

test('Recipe: a recipe that already has a different link asks before it is replaced', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soup');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('onion');
  await page.getByLabel('Video link (optional)').fill('https://vimeo.com/1');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await share(page, `share_url=${YT}`);
  await page.getByRole('button', { name: 'Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Soup' }).click();
  await expect(page.getByText('Replace the link on Soup?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep the old link' }).click();
  await page.getByRole('button', { name: 'Soup' }).click();
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByText('Saved as the video link for Soup.')).toBeVisible();
});
