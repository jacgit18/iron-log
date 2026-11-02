import { test, expect } from './fixtures.js';

// Program library > Archive: a saved program can be put away and restored. A unit test cannot see the list, the collapsed section or the Move sheet.
const openPrograms = async page => {
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await expect(page.locator('#ed-title')).toBeVisible();
};
const save = async (page, name) => {
  await page.getByRole('textbox', { name: /^Save Program A as/ }).fill(name);
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.locator('.lib > .edlist .edrow', { hasText: name })).toBeVisible();
};

test('archive moves a program to the collapsed Archived list, restore brings it back', async ({ page }) => {
  await openPrograms(page);
  await save(page, 'Old block');
  await page.getByRole('button', { name: 'Archive Old block' }).click();
  await expect(page.locator('.lib > .edlist .edrow', { hasText: 'Old block' })).toHaveCount(0);
  const summary = page.getByText('Archived (1)');
  await expect(summary).toBeVisible();
  await expect(page.locator('.libarchive')).not.toHaveAttribute('open', '');
  await summary.click();
  const row = page.locator('.libarchive .edrow', { hasText: 'Old block' });
  await expect(row.getByRole('button', { name: 'Restore Old block' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Delete Old block' })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Load|Edit|Archive/ })).toHaveCount(0);
  await row.getByRole('button', { name: 'Restore Old block' }).click();
  await expect(page.locator('.lib > .edlist .edrow', { hasText: 'Old block' })).toBeVisible();
  await expect(page.getByText('Archived (')).toHaveCount(0);
});

test('an archived program stays archived after a reload', async ({ page }) => {
  await openPrograms(page);
  await save(page, 'Parked');
  await page.getByRole('button', { name: 'Archive Parked' }).click();
  await page.reload();
  await openPrograms(page);
  await expect(page.getByText('Archived (1)')).toBeVisible();
  await expect(page.locator('.lib > .edlist .edrow', { hasText: 'Parked' })).toHaveCount(0);
});

test('Delete in the archive still asks twice', async ({ page }) => {
  await openPrograms(page);
  await save(page, 'Gone soon');
  await page.getByRole('button', { name: 'Archive Gone soon' }).click();
  await page.getByText('Archived (1)').click();
  const del = page.getByRole('button', { name: 'Delete Gone soon' });
  await del.click();
  await expect(page.getByText('Will be deleted')).toBeVisible();
  await del.click();
  await expect(page.getByText('Archived (')).toHaveCount(0);
});

test('loading another program over A archives the saved copy of the old A', async ({ page }) => {
  await openPrograms(page);
  await save(page, 'Old A');
  await page.getByRole('button', { name: 'Create a program' }).click();
  await page.getByRole('radio', { name: /Full body/ }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('.npnext').getByRole('button', { name: /^Load into Program A/ }).click();
  await expect(page.getByText('Archived (1)')).toBeVisible();
  await page.getByText('Archived (1)').click();
  await expect(page.locator('.libarchive .edrow', { hasText: 'Old A' })).toBeVisible();
  await expect(page.locator('.lib > .edlist .edrow', { hasText: 'Old A' })).toHaveCount(0);
});
