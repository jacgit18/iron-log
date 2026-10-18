import { test, expect } from './fixtures.js';

const open = async page => { await page.click('#tab-daily'); await page.click('#daily-grocery'); };

test('editing At home: the add form and Done float, an item takes a note, and the tick works without leaving Edit', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit'); // an empty list opens on At home
  const dock = page.getByRole('region', { name: 'Add an item' });
  await expect(dock).toBeVisible();
  await page.click('#groc-more');
  await page.fill('#groc-name', 'Oat milk'); await page.fill('#groc-note', 'the barista one');
  await page.click('#groc-add');
  await expect(page.locator('#groc-name')).toHaveValue('');
  // still editing: the new When-out item has its own "have it" tick, and it moves the item onto To get
  await expect(page.getByLabel('Have Oat milk')).toBeChecked();
  await page.getByLabel('Have Oat milk').uncheck();
  await page.click('#groc-done');
  await expect(dock).toHaveCount(0);
  await expect(page.locator('.ghome')).toContainText('the barista one');
  await expect(page.locator('.ghome')).toContainText('On the list');
});

test('To get can go past this month to plan, and ticking is closed there', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.click('#groc-more');
  await page.fill('#groc-name', 'Rice'); await page.setChecked('#groc-every', true); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await expect(page.locator('#groc-next')).toBeEnabled();
  await page.click('#groc-next');
  await expect(page.locator('#groc-month')).toContainText('(ahead)');
  await expect(page.locator('#groc-rice')).toBeDisabled();
  await page.click('#groc-prev');
  await expect(page.locator('#groc-month')).toContainText('(this month)');
  await expect(page.locator('#groc-rice')).toBeEnabled();
});

test('Spending shows a bar for a month you bought in, with the average as text', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.click('#groc-more');
  await page.fill('#groc-name', 'Rice'); await page.fill('#groc-price', '10'); await page.setChecked('#groc-every', true); await page.click('#groc-add');
  await page.click('#groc-done');
  await page.click('#groc-view-get');
  await page.locator('#groc-rice').check();
  await page.click('#groc-view-spend');
  await expect(page.locator('#groc-spend-summary')).toContainText('Average $10.00 a month over 1 month');
  await expect(page.locator('.gbars li.cur')).toHaveAttribute('aria-label', /\$10\.00 on 1 item/);
});

test('with a rest timer running the dock sits above the timer bar, and the end of the list is not under it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Rest timer' }).click();
  await expect(page.locator('.timerbar')).toBeVisible();
  await open(page);
  await page.click('#groc-edit');
  const dock = page.locator('.gdock');
  await expect(dock).toBeVisible();
  const d = await dock.boundingBox(); const t = await page.locator('.timerbar').boundingBox();
  expect(d.y + d.height).toBeLessThanOrEqual(t.y + 1); // not covered by the bar
  await page.fill('#groc-name', 'Tea');
  await expect(page.locator('#groc-add')).toBeEnabled();
  await page.click('#groc-add'); // reachable: the click would be intercepted if the timer bar covered it
  await expect(page.locator('#groc-name')).toHaveValue('');
});

test('an existing item takes, changes and loses a note from its edit row', async ({ page }) => {
  await open(page);
  await page.click('#groc-edit');
  await page.fill('#groc-name', 'Eggs'); await page.click('#groc-add');
  const note = page.getByLabel('Note for Eggs');
  await note.fill('pasture raised'); await note.blur();
  await page.click('#groc-done');
  await expect(page.locator('.ghome')).toContainText('pasture raised');
  await page.click('#groc-edit');
  await note.fill(''); await note.blur();
  await page.click('#groc-done');
  await expect(page.locator('.ghome')).not.toContainText('pasture raised');
});
