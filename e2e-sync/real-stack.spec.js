import { expect, newPhone, server, test } from './stack.js';

// The whole stack, nothing mocked: a browser with the sync flag on, the real API, a real Postgres. These cover what the unit and
// API tests cannot: the actual screens, the actual store, and the browser's own storage and network events.

test('a ticked card and an edited session reach the server, and a second phone sees them', async ({ browser, user }) => {
  const a = await newPhone(browser, user);
  const page = await a.open();

  // Two check-offs of Hack Squat give two sessions (Day 3 and Day 5 cards).
  await page.locator('#chk-A-d3s1').check();
  await page.locator('#chk-A-d5s3').check();
  await expect.poll(async () => (await server.entries(user)).filter(e => e.auto).length, { message: 'both check-offs reach the database' }).toBe(2);
  expect((await server.week(user, '2026-09-20')).data.done).toMatchObject({ 'A-d3s1': true, 'A-d5s3': true });

  // Edit one in the exercise sheet (it becomes a session logged by hand), and delete the other.
  await page.locator('#tab-progress').click();
  await page.locator('.pcard', { hasText: 'Hack Squat' }).click();
  const rows = page.locator('table.hist tbody tr');
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button', { name: /^Edit entry/ }).click();
  const form = page.getByRole('form', { name: 'Edit session' });
  await form.locator('input[type="number"]').first().fill('300');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toHaveCount(0);
  await rows.last().getByRole('button', { name: /^Delete entry/ }).click();
  await rows.last().getByRole('button', { name: 'Delete?' }).click();
  await expect(rows).toHaveCount(1);

  // The database ends with exactly one Hack Squat entry: the edited one, logged by hand.
  await expect.poll(async () => (await server.entries(user)).map(e => [e.auto, e.w])).toEqual([[false, 300]]);

  // The same phone, reloaded: it shows what the server holds.
  await page.reload(); // the app reopens on the tab it was on
  await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
  await page.locator('#tab-progress').click();
  await page.locator('.pcard', { hasText: 'Hack Squat' }).click();
  await expect(page.locator('table.hist tbody tr')).toHaveCount(1);
  await expect(page.locator('table.hist')).toContainText('300 lb');

  // A second phone, with nothing of its own, signs in as the same user and sees the same.
  const b = await newPhone(browser, user);
  const second = await b.open();
  await second.locator('#tab-progress').click();
  await second.locator('.pcard', { hasText: 'Hack Squat' }).click();
  await expect(second.locator('table.hist tbody tr')).toHaveCount(1);
  await expect(second.locator('table.hist')).toContainText('300 lb');
  await a.close();
  await b.close();
});

test('offline, a tick is kept and the app says so; back online it arrives and the notice goes', async ({ browser, user }) => {
  const a = await newPhone(browser, user);
  const page = await a.open();

  await a.context.setOffline(true);
  await page.locator('#chk-A-d1s1').check();
  await expect(page.locator('#chk-A-d1s1')).toBeChecked();
  const waiting = page.getByRole('status').filter({ hasText: 'waiting to sync' });
  await expect(waiting).toBeVisible({ timeout: 15_000 });
  await expect(waiting).toContainText('safe on this device');
  expect(await server.entries(user)).toEqual([]);

  // Closing the app while offline loses nothing: a reload (still offline) still shows the tick.
  await page.reload().catch(() => {});
  await a.context.setOffline(false);
  await page.goto('/');
  await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
  await expect(page.locator('#chk-A-d1s1')).toBeChecked({ timeout: 30_000 });

  await expect.poll(async () => (await server.entries(user)).filter(e => e.auto).length, { timeout: 30_000 }).toBe(1);
  await expect(page.getByRole('status').filter({ hasText: 'waiting to sync' })).toHaveCount(0, { timeout: 30_000 });
  await a.close();
});

test('two phones tick the same card: the server keeps one check-off and both phones show the card done', async ({ browser, user }) => {
  const a = await newPhone(browser, user);
  const b = await newPhone(browser, user);
  const pageA = await a.open();
  const pageB = await b.open(); // b has pulled before a ticks, so it will not know about a's tick

  await pageA.locator('#chk-A-d3s1').check();
  await expect.poll(async () => (await server.entries(user)).filter(e => e.auto).length).toBe(1);
  await pageB.locator('#chk-A-d3s1').check();
  await expect(pageB.locator('#chk-A-d3s1')).toBeChecked();

  // b's tick is not a second check-off: it adopts the one that is there.
  await expect.poll(async () => (await pageB.evaluate(() => JSON.parse(localStorage.getItem('ironlog:sync/pending') || '{}'))), { timeout: 30_000 }).toEqual({});
  const entries = await server.entries(user);
  expect(entries.filter(e => e.auto && e.slot === 'A-d3s1')).toHaveLength(1);
  await pageB.click('#tab-settings');
  await expect(pageB.getByRole('heading', { name: 'Sync', exact: true })).toBeVisible();
  await expect(pageB.locator('.syncstatus')).toContainText('Synced');
  await expect(pageB.getByText('already checked off or logged on another device')).toBeVisible();
  await a.close();
  await b.close();
});

test('a user sees only their own data', async ({ browser, user }) => {
  const mine = await newPhone(browser, user);
  const page = await mine.open();
  await page.locator('#chk-A-d1s1').check();
  await expect.poll(async () => (await server.entries(user)).length).toBe(1);

  const other = await newPhone(browser, `${user}-other`);
  const theirs = await other.open();
  await expect(theirs.locator('#chk-A-d1s1')).not.toBeChecked();
  expect(await server.entries(`${user}-other`)).toEqual([]);
  await mine.close();
  await other.close();
});

// ---- Phase E: the data a browser held before accounts ----

const oldDocs = {
  'logs/hack': { schema: 1, entries: [{ d: '2026-09-14', ph: 'strength', w: 200, s: 3, r: 8 }, { d: '2026-09-21', ph: 'strength', w: 210, s: 3, r: 8 }] },
  'body/main': { entries: [{ wk: '2026-09-13', d: '2026-09-14', w: 181 }] },
  'weeks/2026-09-13': { prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} },
};

test('data from before accounts is uploaded once, all of it, and a second phone sees it', async ({ browser, user }) => {
  const a = await newPhone(browser, user, oldDocs);
  const page = await a.open();
  const card = page.getByRole('status').filter({ hasText: 'Upload this device’s data?' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('2 logged sessions');
  await expect(card).toContainText('1 body weight');
  expect(await server.counts(user)).toEqual({ entries: 0, body: 0, weeks: 0 }); // nothing goes until the user says so

  await card.getByRole('button', { name: 'Upload' }).click();
  await expect(card).toHaveCount(0);
  expect(await server.counts(user)).toEqual({ entries: 2, body: 1, weeks: 1 });

  // The phone shows what it uploaded, and the old copy is still on the device.
  await page.locator('#tab-progress').click();
  await page.locator('.pcard', { hasText: 'Hack Squat' }).click();
  await expect(page.locator('table.hist:not(.bwtab) tbody tr')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('ironlog:logs/hack'))).toContain('"w":210');

  // Reloading does not offer it again, and a second phone with nothing of its own sees the same.
  await page.reload();
  await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Upload this device’s data?' })).toHaveCount(0);
  const b = await newPhone(browser, user);
  const second = await b.open();
  await second.locator('#tab-progress').click();
  await second.locator('.pcard', { hasText: 'Hack Squat' }).click();
  await expect(second.locator('table.hist:not(.bwtab) tbody tr')).toHaveCount(2);
  expect(await server.counts(user)).toEqual({ entries: 2, body: 1, weeks: 1 });
  await a.close();
  await b.close();
});

test('once something new is logged the upload is no longer possible, and the card says so instead of failing', async ({ browser, user }) => {
  const a = await newPhone(browser, user, oldDocs);
  const page = await a.open();
  await expect(page.getByRole('status').filter({ hasText: 'Upload this device’s data?' })).toBeVisible();
  await page.locator('#chk-A-d1s1').check();
  const info = page.getByRole('status').filter({ hasText: 'Old data on this device' });
  await expect(info).toBeVisible();
  await expect(info).toContainText('cannot be added automatically');
  await expect.poll(async () => (await server.counts(user)).entries).toBe(1); // only the new tick; the old data was not mixed in
  await info.getByRole('button', { name: 'Got it' }).click();
  await expect(info).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: /Old data on this device|Upload this device/ })).toHaveCount(0);
  await a.close();
});
