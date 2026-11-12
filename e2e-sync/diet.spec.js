import pg from 'pg';
import { expect, newPhone, server, test } from './stack.js';

// Diet safety checks (brief diet-safety-checks): the food log against the whole stack, nothing mocked. Entries are `list_items` rows of the
// list `diet_entry` (ADR 086), synced as the document diet/main. The rules are node tests; this covers two phones, the database, and a restore.
const pool = new pg.Pool({ connectionString: process.env.E2E_DATABASE_URL });
const dietRows = async user => (await pool.query(
  `select li.client_id, li.data, li.version from list_items li join users u on u.id = li.user_id
    where u.auth_user_id = $1 and li.list = 'diet_entry' and li.deleted_at is null order by li.client_id`, [`dev:${user}`])).rows;
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
// Today's column of the Nutrition week board (brief nutrition-board): food is added from the add sheet's One-off food, and eaten food is listed in `.nb-eat` rows.
const diet = page => page.locator('.nb-col.today');
const addFood = async (page, name, kcal, protein) => {
  await page.locator('#nb-add').click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^One-off food/ }).click();
  await sheet.locator('#dt-add-n').fill(name);
  await sheet.locator('#dt-add-k').fill(String(kcal));
  await sheet.locator('#dt-add-p').fill(String(protein));
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(diet(page).locator('.nb-eat', { hasText: name })).toBeVisible();
};
const reload = async page => { await page.reload(); await expect(page.locator('#live-status')).not.toContainText('Loading…', { timeout: 30_000 }); };

// Delete an eaten food: its row opens the row sheet, and Delete there needs two taps (ADR 023).
const removeFood = async (page, name) => {
  await diet(page).getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await page.getByRole('dialog').getByRole('button', { name: `Delete ${name}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Tap again to delete/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
};

test('a food logged on one phone reaches the account, shows on a second phone, and an edit and a delete cross back', async ({ browser, user }) => {
  await server.seedPrograms(user);
  const a = await newPhone(browser, user);
  const page = await a.open();
  await nutrition(page);
  await addFood(page, 'Rice', 200, 4);
  await addFood(page, 'Chicken', 350, 40);
  await expect.poll(async () => (await dietRows(user)).map(r => [r.data.n, r.data.kcal, r.data.p]), { message: 'both entries reach the database' })
    .toEqual(expect.arrayContaining([['Rice', 200, 4], ['Chicken', 350, 40]]));
  expect(await dietRows(user)).toHaveLength(2);

  // A second phone with nothing of its own shows the same log.
  const b = await newPhone(browser, user);
  const second = await b.open();
  await nutrition(second);
  await expect(diet(second).locator('.nb-eat')).toHaveCount(2);
  await expect(diet(second).locator('.nb-eat', { hasText: 'Chicken' })).toContainText('350');

  // The second phone edits one and deletes the other; the database ends with the one edited row.
  const rice = (await dietRows(user)).find(r => r.data.n === 'Rice');
  await diet(second).getByRole('button', { name: /^Rice/ }).click(); // an eaten row opens its sheet
  await second.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  await second.locator(`#nb-e-${rice.client_id}-k`).fill('260');
  await second.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await second.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await removeFood(second, 'Chicken');
  await expect.poll(async () => (await dietRows(user)).map(r => [r.data.n, r.data.kcal])).toEqual([['Rice', 260]]);

  // The first phone picks the changes up when it next loads (as in grocery.spec.js), shows the account's log, and keeps no private copy of it.
  await reload(page);
  await nutrition(page);
  await expect(diet(page).locator('.nb-eat')).toContainText('260');
  await expect(diet(page).locator('.nb-eat')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('ironlog:diet/main'))).toBeNull();
  await a.close();
  await b.close();
});

test('Copy to day and Move to day sync: the copy keeps its hour and numbers in the database, on a second phone and after a reload; a move leaves one row on the target day', async ({ browser, user }) => {
  await server.seedPrograms(user);
  const a = await newPhone(browser, user);
  const page = await a.open();
  await nutrition(page);
  await addFood(page, 'Rice', 200, 4);
  await expect.poll(async () => (await dietRows(user)).length).toBe(1);
  const orig = (await dietRows(user))[0];
  expect(typeof orig.data.t).toBe('number'); // logged today: stamped with the local hour

  // Copy to yesterday (Wed 23): a second row with the same food and the same hour; the original stays.
  await diet(page).getByRole('button', { name: /^Rice/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Copy to…' }).click();
  await page.getByRole('dialog').getByRole('group', { name: 'Copy to day' }).getByRole('button', { name: /^Wed 23/ }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Added 1 from Rice.');
  await expect.poll(async () => (await dietRows(user)).length).toBe(2);
  const copyRow = (await dietRows(user)).find(r => r.client_id !== orig.client_id);
  expect(copyRow.data).toMatchObject({ n: 'Rice', kcal: 200, p: 4, t: orig.data.t });
  expect(copyRow.data.d).not.toBe(orig.data.d);

  // A second phone and a reload of the first both show the copy with its hour.
  const b = await newPhone(browser, user);
  const second = await b.open();
  await nutrition(second);
  await expect(second.locator('.nb-eat', { hasText: 'Rice' })).toHaveCount(2);
  await reload(page);
  await nutrition(page);
  await expect(page.locator('.nb-eat', { hasText: 'Rice' })).toHaveCount(2);
  expect((await dietRows(user)).find(r => r.client_id === copyRow.client_id).data.t).toBe(orig.data.t);

  // Move today's Rice to the same day: one row left there, none today, hour kept.
  await diet(page).getByRole('button', { name: /^Rice/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to…' }).click();
  await page.getByRole('dialog').getByRole('group', { name: 'Move to day' }).getByRole('button', { name: /^Wed 23/ }).click();
  await expect(page.locator('.nb-msg')).toHaveText('Moved 1 from Rice.');
  await expect.poll(async () => (await dietRows(user)).map(r => r.data.d)).toEqual([copyRow.data.d, copyRow.data.d]); // none left today, both on the target day
  const rows = await dietRows(user);
  expect(rows.every(r => r.data.d === copyRow.data.d && r.data.t === orig.data.t)).toBe(true);
  await a.close();
  await b.close();
});

test('restoring the account backup brings a lost food log back on screen and into the database', async ({ browser, user }) => {
  await server.seedPrograms(user);
  await pool.query("update users set plan = 'paid' where auth_user_id = $1", [`dev:${user}`]); // account backups are for paid accounts and admins
  const a = await newPhone(browser, user);
  await a.page.clock.setSystemTime(new Date()); // the server accepts only a day near its own today
  const page = await a.open();
  await page.locator('#chk-A-d1s1').click(); // some training data so the copy is worth keeping
  await nutrition(page);
  await addFood(page, 'Oats', 300, 10);
  await addFood(page, 'Eggs', 160, 13);
  await expect.poll(async () => (await dietRows(user)).length).toBe(2);
  // The copy that holds the log is the daily upload; wait for it, then lose the log.
  await page.clock.fastForward(40_000);
  await expect.poll(async () => Number((await pool.query(`select count(*) as n from backup_snapshots b join users u on u.id = b.user_id where u.auth_user_id = $1`, [`dev:${user}`])).rows[0].n), { timeout: 30_000 }).toBe(1);
  await removeFood(page, 'Oats');
  await removeFood(page, 'Eggs');
  await expect.poll(async () => (await dietRows(user)).length).toBe(0);

  // Settings > Backups > Restore account copy opens the import review; the Food log is a ticked section; Add to my data puts the entries back.
  await page.locator('#account-badge').click();
  await page.getByRole('group', { name: 'Account menu' }).getByRole('button', { name: 'Data' }).click();
  await page.getByRole('group', { name: 'Backups' }).getByRole('button', { name: /^Restore account copy from/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Food log: 2 entries');
  await dialog.getByRole('button', { name: 'Add to my data' }).click();
  await expect.poll(async () => (await dietRows(user)).map(r => r.data.n).sort(), { message: 'the restored entries are written to the account' }).toEqual(['Eggs', 'Oats']);
  await nutrition(page);
  await expect(diet(page).locator('.nb-eat')).toHaveCount(2);
  await a.close();
});
