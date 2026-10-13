import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The exercise picker in the add sheets (ADR 036): your library, the catalog when syncing, a create row. The API is scripted, as in
// sync.spec.js: the account has Program A with one Lat Pulldown card.
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const signedInAsDev = json(200, { ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } });
const rowBase = { client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null };
const ownProgram = { key: 'A', days: [{ title: 'Day 1', slots: [{ id: 'A-d1s1', sec: 'Regular', tier: 'Primary', items: [{ ex: 'latpd', ph: 'hyp', w: 45 }] }] }] };
const pull = { rows: [
  { table: 'programs', key: 'A', data: ownProgram, ...rowBase, seq: '1' },
  { table: 'list_items', list: 'stretch', client_id: 'scarecrow', position: 0, data: { id: 'scarecrow', n: 'Scarecrow', group: 'Bands', tier: 'primary' }, ...rowBase, seq: '2' },
  { table: 'list_items', list: 'supplement_item', client_id: 'fishoil', position: 0, data: { id: 'fishoil', n: 'Fish Oil', slot: '', dose: '1 g' }, ...rowBase, seq: '3' },
], cursor: '3', more: false };
const catalog = { ok: true, items: [
  { id: 'c:fedb:Cable_Fly', name: 'Cable Fly', data: { eq: 'cable', muscles: { p: ['chest'] } } },
  { id: 'c:fedb:Cable_Lat_Raise', name: 'Cable Lateral Raise (Kneeling)', data: { eq: 'cable', muscles: { p: ['delts'] } } },
  { id: 'c:fedb:Hammer_Row', name: 'Hammer Row Test', data: { eq: 'dumbbell' } }, // the same name as one the test creates: then never offered
] };

const stretchCatalog = { ok: true, items: [{ id: 'c:fedb:Calf_Stretch', name: 'Calf Stretch', data: { muscles: { p: ['calves'], mob: true } } }] };
// Each list's catalog, as GET /api/catalog?kind=... answers it.
const byKind = route => json(200, new URL(route.request().url()).searchParams.get('kind') === 'stretch' ? stretchCatalog : catalog)(route);

async function openSynced(page, catalogAnswer = byKind) {
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

test('after the catalog fails to load, Try again asks again and shows it (the failure is not kept)', async ({ page }) => {
  let calls = 0;
  await openSynced(page, route => (++calls === 1 ? json(500, {})(route) : json(200, catalog)(route)));
  await openAdd(page);
  await field(page).fill('fly');
  await expect(page.getByRole('dialog').locator('.picknote')).toHaveText('The catalog could not be loaded.Try again');
  await page.getByRole('dialog').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('group', { name: 'Catalog' }).getByRole('option')).toHaveText([/Cable Fly/]);
  await expect(field(page)).toBeFocused(); // Try again does not take focus from the field
  expect(calls).toBe(2);
});

test('a new stretch picked from the catalog is saved with its group and the routine chosen in the sheet', async ({ page }) => {
  await openSynced(page);
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Stretch library', exact: true }).click();
  await page.click('#slib-new');
  const name = page.getByRole('dialog').getByRole('combobox', { name: 'Name' });
  await name.fill('calf');
  await page.getByRole('group', { name: 'Catalog' }).getByRole('option', { name: /Calf Stretch/ }).click();
  await expect(name).toHaveValue('Calf Stretch');
  await expect(page.getByRole('dialog').getByText('From the catalog. It will be added to your stretches when you save.')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Group' })).toHaveValue('Calves');
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'On the board' })).toHaveValue('primary'); // Every day, not forced to Library only
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.locator('.exlib .exrow').filter({ hasText: 'Calf Stretch' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.pill')).toHaveText('Library');
  await expect(row.locator('xpath=ancestor::div[1]').locator('.sect')).toHaveText('Every day');
});

test('typing a stretch you already have offers it, and picking it opens that stretch instead of a second one', async ({ page }) => {
  await openSynced(page);
  await page.click('#tab-program');
  await page.getByRole('button', { name: 'Stretch library', exact: true }).click();
  await page.click('#slib-new');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Name' }).fill('scare');
  await page.getByRole('group', { name: 'Yours' }).getByRole('option', { name: /Scarecrow/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading')).toHaveText('Edit stretch');
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Name' })).toHaveValue('Scarecrow');
});

test('a stretch to try can be found in the catalog from the Stretches tab', async ({ page }) => {
  await openSynced(page);
  await page.click('#board-stretches');
  await page.click('#sexp-add');
  const name = page.getByRole('dialog').getByRole('combobox', { name: 'Name' });
  await name.fill('calf');
  await page.getByRole('option', { name: /Calf Stretch/ }).click();
  await expect(name).toHaveValue('Calf Stretch');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.expcard').filter({ hasText: 'Calf Stretch' })).toHaveCount(1);
});

// Supplements: the server searches (ADR 029). `products` answers GET /api/catalog/search by the words typed; `slowFor` holds one query back.
const products = [
  { id: 'c:dsld:1', name: 'Creatine Monohydrate', brand: 'NOW Foods', data: { form: 'Powder' } },
  { id: 'c:dsld:2', name: 'Creatine HCl', brand: 'Kaged', data: { form: 'Capsule' } },
];
const search = (slowFor = '') => async route => {
  const q = new URL(route.request().url()).searchParams.get('q').toLowerCase();
  if (q === slowFor) await new Promise(r => setTimeout(r, 1500));
  const items = products.filter(p => q.split(' ').every(w => `${p.name} ${p.brand}`.toLowerCase().includes(w)));
  return json(200, { ok: true, items, more: false })(route);
};
const openSupplements = async (page, answer = search()) => {
  await page.route('**/api/catalog/search?*', answer);
  await openSynced(page);
  await page.click('#tab-daily'); await page.click('#daily-supplements');
  await page.click('#sched-edit');
};
const morningName = page => page.getByRole('combobox', { name: 'Add to Morning' });

test('Supplements tab: a catalog product picked in a section joins your supplements there, with the dose typed', async ({ page }) => {
  await openSupplements(page);
  await morningName(page).fill('creatine now');
  await page.getByRole('group', { name: 'Catalog' }).getByRole('option', { name: /Creatine Monohydrate/ }).click();
  await expect(page.getByText('From the catalog. It joins your supplements in Morning.')).toBeVisible();
  await page.fill('#suppdose-morning', '5 g');
  await page.click('#suppadd-morning');
  const morning = page.getByRole('group', { name: 'Morning' });
  await expect(morning.locator('.warmrow')).toContainText(['Creatine Monohydrate · 5 g']);
  await expect(morningName(page)).toHaveValue('');
});

test('Supplements tab: one of yours from the library is offered by name and moves into the section', async ({ page }) => {
  await openSupplements(page);
  await morningName(page).fill('fish');
  await page.getByRole('group', { name: 'Yours' }).getByRole('option', { name: /Fish Oil/ }).click();
  await expect(page.getByText('Moves it to Morning.')).toBeVisible();
  await page.click('#suppadd-morning');
  await expect(page.getByRole('group', { name: 'Morning' }).locator('.warmrow')).toContainText(['Fish Oil · 1 g']);
  await expect(page.locator('#supplib-morning')).toHaveCount(0); // the old "Add from your library" menu is gone
});

test('Supplements tab: a slow answer to an older search never replaces the newer one', async ({ page }) => {
  await openSupplements(page, search('creatine'));
  await morningName(page).fill('creatine');
  await page.waitForTimeout(500); // past the wait, so the slow search for "creatine" is sent
  await morningName(page).fill('creatine kaged');
  const catalogOpts = page.getByRole('group', { name: 'Catalog' }).getByRole('option');
  await expect(catalogOpts).toHaveText([/Creatine HCl/]);
  await page.waitForTimeout(1500); // the "creatine" answer (both products) arrives now
  await expect(catalogOpts).toHaveText([/Creatine HCl/]);
});

test('Supplements tab: while a new search runs, the last answer is filtered by the new words (never shown under unrelated ones)', async ({ page }) => {
  await openSupplements(page, search('zinc'));
  await morningName(page).fill('creatine');
  const catalogOpts = page.getByRole('group', { name: 'Catalog' }).getByRole('option');
  await expect(catalogOpts).toHaveCount(2);
  await morningName(page).fill('zinc'); // the zinc answer takes 1.5 s; the creatine products must not show meanwhile
  await expect(page.getByText('Searching the catalog…')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Catalog' })).toHaveCount(0);
});
