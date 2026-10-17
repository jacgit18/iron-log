import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';

// The data file is the one backup (ADR 035): Export all data, change things, and bring the file back with Cancel, Add and Replace.
const openSettings = page => page.getByRole('tab', { name: 'Settings', exact: true }).click();
const setRest = async (page, seconds) => {
  const rest = page.locator('#rest-s');
  await rest.fill(String(seconds));
  await rest.press('Enter');
  await expect(rest).toHaveValue(String(seconds));
  await expect(page.locator('label[for="rest-s"]').getByText('✓ Saved')).toBeVisible();
};
const exportFile = async page => {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all data' }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/^iron-log-data-.*\.json$/);
  const text = await readFile(await download.path(), 'utf8');
  return { text, data: JSON.parse(text) };
};
const importText = async (page, text) => {
  await page.locator('#imp-file').setInputFiles({ name: 'iron-log-data.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('dialog', { name: 'Import data' })).toBeVisible();
};

async function exportedWithRest120(page) {
  await openSettings(page);
  await setRest(page, 120);
  const file = await exportFile(page);
  expect(file.data.config.rest).toBe(120);
  await setRest(page, 45); // the app now differs from the file
  return file;
}

test('Cancel on the import review changes nothing', async ({ page }) => {
  const file = await exportedWithRest120(page);
  await importText(page, file.text);
  await page.getByRole('dialog', { name: 'Import data' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Import data' })).toHaveCount(0);
  await expect(page.locator('#rest-s')).toHaveValue('45');
});

test('Replace makes the ticked tabs match the file', async ({ page }) => {
  const file = await exportedWithRest120(page);
  await importText(page, file.text);
  const dialog = page.getByRole('dialog', { name: 'Import data' });
  const replace = dialog.getByRole('button', { name: 'Replace my data' });
  await replace.click(); // the first tap only arms it
  await expect(page.getByRole('dialog', { name: 'Import data' })).toBeVisible();
  await dialog.getByRole('button', { name: /^Tap again to replace/ }).click();
  await expect(page.getByRole('dialog', { name: 'Import data' })).toHaveCount(0);
  await expect(page.locator('#rest-s')).toHaveValue('120');
  const again = await exportFile(page);
  expect(again.data.config).toEqual(file.data.config);
  expect(again.data.programs).toEqual(file.data.programs);
});

test('Add to my data closes the review and does not lose or duplicate what is here', async ({ page }) => {
  await page.locator('#chk-A-d1s1').check(); // a ticked card, so there is a week to keep
  await page.locator('#bw-in').fill('181.5'); // and a body weight, so a duplicate would show
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  const file = await exportedWithRest120(page);
  const before = await exportFile(page);
  expect(Object.keys(before.data.weeks).length).toBeGreaterThan(0);
  expect(before.data.body).toHaveLength(1);
  await importText(page, file.text);
  await page.getByRole('dialog', { name: 'Import data' }).getByRole('button', { name: 'Add to my data' }).click();
  await expect(page.getByRole('dialog', { name: 'Import data' })).toHaveCount(0);
  const after = await exportFile(page);
  expect(after.data.weeks).toEqual(before.data.weeks);
  expect(after.data.logs).toEqual(before.data.logs);
  expect(after.data.body).toEqual(before.data.body);
});
