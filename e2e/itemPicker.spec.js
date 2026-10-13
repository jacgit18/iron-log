import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The exercise picker in the add sheets (ADR 036): your library, the catalog when syncing, a create row. The API is scripted, as in
// sync.spec.js: the account has Program A with one Lat Pulldown card.
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const signedInAsDev = json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
const ownProgram = { key: 'A', days: [{ title: 'Day 1', slots: [{ id: 'A-d1s1', sec: 'Regular', tier: 'Primary', items: [{ ex: 'latpd', ph: 'hyp', w: 45 }] }] }] };
const pull = { rows: [{ table: 'programs', key: 'A', data: ownProgram, ...rowBase, seq: '1' }], cursor: '1', more: false };
const catalog = { ok: true, items: [
  { id: 'c:fedb:Cable_Fly', name: 'Cable Fly', data: { eq: 'cable', muscles: { p: ['chest'] } } },
  { id: 'c:fedb:Cable_Lat_Raise', name: 'Cable Lateral Raise (Kneeling)', data: { eq: 'cable', muscles: { p: ['delts'] } } },
  { id: 'c:fedb:Hammer_Row', name: 'Hammer Row Test', data: { eq: 'dumbbell' } }, // the same name as one the test creates: then never offered
] };

async function openSynced(page, catalogAnswer = json(200, catalog)) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
  });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', signedInAsDev);
  await page.route('**/api/commands/**', json(200, { rows: [], cursor: '2' }));
  await page.route('**/api/catalog?*', catalogAnswer);
  await page.goto('/');
  await expect(page.locator('#chk-A-d1s1')).toBeVisible();
}
const openAdd = async page => { await page.click('#tab-program'); await page.getByRole('button', { name: '+ Add exercise', exact: true }).click(); };
const field = page => page.getByRole('dialog').getByRole('combobox', { name: 'Exercise' });
const libraryNames = async page => {
  await page.getByRole('button', { name: 'Exercise library', exact: true }).click();
  return page.locator('.exlib .exrow .exmain b').allTextContents();
};

test('a catalog exercise picked with the keyboard goes on the card and into the library on Save', async ({ page }) => {
  await openSynced(page);
  await openAdd(page);
  await field(page).fill('cable');
  const list = page.getByRole('listbox', { name: 'Exercise' });
  await expect(list.getByRole('group', { name: 'Catalog' }).getByRole('option')).toHaveText([/Cable Fly/, /Cable Lateral Raise \(Kneeling\)/]);
  await expect(list.getByRole('option', { name: /Create “cable”/ })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map(v => v.id)).toEqual([]);
  await field(page).press('ArrowDown');
  await expect(field(page)).toHaveAttribute('aria-activedescendant', /opt-0$/);
  await field(page).press('Enter');
  await expect(field(page)).toHaveValue('Cable Fly');
  await expect(page.getByRole('dialog').getByText('From the catalog. It will be added to your exercise library when you save.')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Equipment' })).toHaveValue('cable');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.edpanel:not(.lib) .edrow .edmain b')).toContainText(['Cable Fly']);
  const names = await libraryNames(page);
  expect(names.filter(n => n.startsWith('Cable Fly'))).toHaveLength(1);
});

test('Cancel after picking a catalog exercise leaves the library as it was', async ({ page }) => {
  await openSynced(page);
  await page.click('#tab-program');
  const before = await libraryNames(page);
  await page.getByRole('button', { name: 'Programs', exact: true }).click();
  await page.getByRole('button', { name: '+ Add exercise', exact: true }).click();
  await field(page).fill('fly');
  await page.getByRole('option', { name: /Cable Fly/ }).click(); // a tap picks without the field losing focus first
  await expect(field(page)).toHaveValue('Cable Fly');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  expect(await libraryNames(page)).toEqual(before);
});

test('your own exercise comes first, a catalog item with the same name is not offered, and Escape closes only the list', async ({ page }) => {
  await openSynced(page);
  await openAdd(page);
  await field(page).fill('Hammer Row Test');
  await page.getByRole('option', { name: /Create “Hammer Row Test”/ }).click(); // your own, made before the catalog one is picked
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: '+ Add exercise', exact: true }).click();
  await field(page).fill('hammer row');
  await expect(page.getByRole('group', { name: 'Yours' }).getByRole('option')).toHaveText([/^Hammer Row Test/]);
  await expect(page.getByRole('group', { name: 'Catalog' })).toHaveCount(0);
  await field(page).fill('hammer row test');
  await expect(page.getByRole('option', { name: /Create/ })).toHaveCount(0); // exactly one of yours
  await field(page).press('Escape');
  await expect(page.getByRole('listbox', { name: 'Exercise' })).toBeHidden();
  await expect(page.getByRole('dialog')).toBeVisible();
  await field(page).press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('offline catalog: the picker says so, and a new exercise can still be created', async ({ page }) => {
  await openSynced(page, route => route.abort('internetdisconnected'));
  await openAdd(page);
  await field(page).fill('Sled Push Test');
  await expect(page.getByRole('dialog').locator('.picknote')).toHaveText('The catalog needs a connection.Try again');
  await page.getByRole('option', { name: /Create “Sled Push Test”/ }).click();
  await expect(page.getByRole('dialog').getByText('New exercise. It will be added to your exercise list.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.edpanel:not(.lib) .edrow .edmain b')).toContainText(['Sled Push Test']);
});

test('the day-add sheet offers the catalog too and puts the pick on that day', async ({ page }) => {
  await openSynced(page);
  await page.click('#addweek-1');
  await field(page).fill('fly');
  await page.getByRole('option', { name: /Cable Fly/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.card').filter({ hasText: 'Cable Fly' })).toHaveCount(1);
});
