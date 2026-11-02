import { test, expect } from './fixtures.js';

// A shared link saved to a NEW exercise, or to a catalog one (brief share-create-exercise). The sheet is the one in shareTarget.spec.js.
const YT = 'https%3A%2F%2Fyoutu.be%2Fabc123';
const start = async (page, title = 'Cable%20Lateral%20Raise') => {
  await page.goto(`/?share_title=${title}&share_url=${YT}`);
  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
};

test('Create new exercise: the title fills the name, the link is saved, and it is in the library', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Create new exercise' }).click();
  await expect(page.getByLabel('Exercise name')).toHaveValue('Cable Lateral Raise');
  await page.getByRole('dialog').getByLabel('Equipment').selectOption({ label: 'Cable' });
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByText('Saved as the video link for Cable Lateral Raise.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercise library', exact: true }).click();
  await expect(page.locator('.exlib .exrow .exmain b', { hasText: 'Cable Lateral Raise' })).toBeVisible();
});

test('Create new exercise: an empty or duplicate name saves nothing, and Back returns to the search', async ({ page }) => {
  await start(page, '');
  await page.getByRole('button', { name: 'Create new exercise' }).click();
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByRole('alert')).toHaveText('Give the exercise a name.');
  await page.getByLabel('Exercise name').fill('Lat Pulldown');
  await page.getByRole('button', { name: 'Save exercise' }).click();
  await expect(page.getByRole('alert')).toHaveText('That exercise is already in the library.');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('combobox', { name: 'Find an exercise' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Save this link' })).toBeVisible();
});

test('typing a new name in the search offers to create it with that name', async ({ page }) => {
  await start(page);
  await page.getByRole('combobox', { name: 'Find an exercise' }).fill('Zzzq Test Raise');
  await page.getByRole('option', { name: /Create “Zzzq Test Raise”/ }).click();
  await expect(page.getByLabel('Exercise name')).toHaveValue('Zzzq Test Raise');
});

// The catalog part needs a syncing account; the API is scripted as in itemPicker.spec.js.
test('a catalog exercise found by the share sheet joins the library with the link as its video', async ({ page }) => {
  const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const base = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
  const program = { key: 'A', days: [{ title: 'Day 1', slots: [{ id: 'A-d1s1', sec: 'Regular', tier: 'Primary', items: [{ ex: 'latpd', ph: 'hyp', w: 45 }] }] }] };
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/sync*', json(200, { rows: [{ table: 'programs', key: 'A', data: program, ...base, seq: '1' }], cursor: '1', more: false }));
  await page.route('**/api/me', json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }));
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', json(200, { ok: true, items: [{ id: 'c:fedb:Cable_Fly', name: 'Cable Fly', data: { eq: 'cable', muscles: { p: ['chest'] } } }] }));
  await page.goto(`/?share_url=${YT}`);
  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByRole('combobox', { name: 'Find an exercise' }).fill('cable fly');
  await page.getByRole('group', { name: 'Catalog' }).getByRole('option', { name: /^Cable Fly/ }).click();
  await expect(page.getByText('Saved as the video link for Cable Fly.')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Exercise library', exact: true }).click();
  await expect(page.locator('.exlib .exrow .exmain b', { hasText: 'Cable Fly' })).toBeVisible();
});
