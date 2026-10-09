import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Syncing through the API is behind a flag (feature-flags.md). These run with it on and the API answering as scripted;
// there is no real API behind `vite preview`, so every /api request is intercepted.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

const signedInAsDev = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }) });

// What the server sends an account that already has data: one past session of Lat Pulldown. An account with no data at all starts on a blank
// board (ADR 016), so tests that tick a card need this, as a real returning user has it.
const accountRows = [{ table: 'log_entries', client_id: 'seed-1', exercise_id: 'latpd', d: '2026-01-05', wk: '2026-01-05', phase: 'hyp', weight_lb: '45', sets_count: '4', reps: '12', hold_sec: null, sets: null, note: null, slot: 'A-d1s1', auto: false, client_updated_at: '2026-01-05T10:00:00Z', version: 1, deleted_at: null, seq: '1' }];
const accountPull = { rows: accountRows, cursor: '1', more: false };
const emptyPull = { rows: [], cursor: '0', more: false }; // an account with nothing in it yet

// The helpers below model a returning browser: it has seen a signed-in session (the marker is seeded once, so a sign-out can clear it).
async function open(page, answer) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true'); if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); }
  });
  await page.route('**/api/**', answer);
  await page.route('**/api/me', signedInAsDev); // who is signed in is asked first; the rest is answered as scripted
  await page.goto('/');
}

test.describe('an app the server says is too old (426)', () => {
  const tooOld = route => route.fulfill({
    status: 426,
    contentType: 'application/json',
    headers: { 'x-min-client-version': '9999999999' },
    body: JSON.stringify({ ok: false, error: 'update-required', minClientVersion: 9999999999 }),
  });

  test('says an update is needed, and that nothing is lost', async ({ page }) => {
    await open(page, tooOld);
    const notice = page.getByRole('alert').filter({ hasText: 'Update needed' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your changes are kept on this device');
    await expect(notice.getByRole('button', { name: 'Reload to update' })).toBeVisible();
  });

  test('has no accessibility violations with the notice showing', async ({ page }) => {
    await open(page, tooOld);
    await expect(page.getByRole('alert').filter({ hasText: 'Update needed' })).toBeVisible();
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test('with the flag on and the server answering, the app finishes loading and shows no notice', async ({ page }) => {
  await open(page, route => {
    const url = route.request().url();
    if (url.includes('/api/sync')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accountPull) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await expect(page.locator('#chk-A-d1s1')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Update needed' })).toHaveCount(0);
  await page.locator('#chk-A-d1s1').check(); // writes go out as commands; the 404 is a server problem, so they wait and nothing breaks
  await expect(page.locator('#chk-A-d1s1')).toBeChecked();
});

// ---- A new account's empty board (ADR 016) ----

test.describe('the first-run prompt', () => {
  test('a new account sees it on its blank board, with no warm-up of someone else\'s, and it opens the add-exercise sheet', async ({ page }) => {
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    const prompt = page.getByRole('region', { name: 'Build your first workout' });
    await expect(prompt).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#chk-A-d1s1')).toHaveCount(0);
    await expect(page.getByText('Shadow box')).toHaveCount(0);
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await prompt.getByRole('button', { name: 'Add your first exercise' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Add exercise/ })).toBeVisible();
  });

  test('an account that has data never sees it', async ({ page }) => {
    await openSynced(page);
    await expect(page.locator('#chk-A-d1s1')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Build your first workout' })).toHaveCount(0);
    await expect(page.getByText('Shadow box').first()).toBeVisible();
  });
});

test.describe('the stretch routine of a new account (ADR 016)', () => {
  test('is empty with a prompt, and the button opens the new-stretch sheet', async ({ page }) => {
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await page.locator('#board-stretches').click();
    const prompt = page.getByRole('region', { name: 'Build your stretch routine' });
    await expect(prompt).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Scarecrow')).toHaveCount(0); // none of the owner's default routine
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await prompt.getByRole('button', { name: 'Add your first stretch' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('an account that has data keeps the default routine, with no prompt', async ({ page }) => {
    await openSynced(page);
    await page.locator('#board-stretches').click();
    await expect(page.getByText('Scarecrow').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Build your stretch routine' })).toHaveCount(0);
  });
});

test.describe('while the data is loading', () => {
  // The server's first answer is held back, so the app is mid-load for a moment we control.
  const slow = (pull, ms) => async route => { await new Promise(r => setTimeout(r, ms)); return json(200, pull)(route); };
  for (const [what, pull] of [['a new account', emptyPull], ['an account with data', accountPull]]) {
    test(`${what} sees none of the board until it has loaded (no one else's plan flashes up)`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
      });
      await page.route('**/api/sync*', slow(pull, 2500));
      await page.route('**/api/me', signedInAsDev);
      await page.goto('/');
      await expect(page.locator('.saveflag')).toHaveText('Loading…');
      await page.waitForTimeout(800); // well inside the 2.5 s the server is held back
      await expect(page.locator('#chk-A-d1s1')).toHaveCount(0);
      await expect(page.locator('.col, .card')).toHaveCount(0);
      await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
      if (pull.rows.length) await expect(page.locator('#chk-A-d1s1')).toBeVisible();
      else { await expect(page.getByRole('region', { name: 'Build your first workout' })).toBeVisible(); await expect(page.locator('#chk-A-d1s1')).toHaveCount(0); } // loaded: a blank board with its prompt, none of the built-in cards
    });
  }
});

// ---- The sync screen (D6): status, changes waiting, changes the server would not take ----

const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The server answers pulls normally, so the app finishes loading; `commands` decides what it says to every write.
async function openSynced(page, commands, me = signedInAsDev, pull = accountPull, { board = true } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true'); if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); }
  });
  await page.route('**/api/sync*', json(200, pull));
  await page.route('**/api/me', me);
  if (commands) await page.route('**/api/commands/**', commands);
  await page.goto('/');
  // An account with data has its cards; a new one has a blank board, so there is no card to wait for, only the end of loading.
  // `board: false` is for a device that cannot load anything (signed out, offline): the data views stay empty, so only the app itself is waited for.
  if (!board) await expect(page.locator('#tab-board')).toBeVisible();
  else if (pull.rows.length) await expect(page.locator('#chk-A-d1s1')).toBeVisible();
  else await expect(page.locator('.saveflag')).not.toHaveText('Loading…', { timeout: 30_000 });
}
const openSettings = async page => { await page.click('#tab-settings'); await expect(page.getByRole('heading', { name: 'Sync', exact: true })).toBeVisible(); };

test.describe('the Sync panel', () => {
  test('is not there at all when the flag is off', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
    await page.goto('/');
    await page.click('#tab-settings');
    await expect(page.getByRole('heading', { name: 'Erase data' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sync', exact: true })).toHaveCount(0);
  });

  test('says Synced, and has the app version', async ({ page }) => {
    await openSynced(page);
    await openSettings(page);
    await expect(page.locator('.syncstatus')).toContainText('Synced');
    await expect(page.getByText(/^App version /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  test('offline: a tick is kept, a notice says so, and Details leads to the panel', async ({ page, context }) => {
    await openSynced(page, route => route.abort());
    await context.setOffline(true);
    await page.locator('#chk-A-d1s1').check();
    await expect(page.locator('#chk-A-d1s1')).toBeChecked();
    const notice = page.getByRole('status').filter({ hasText: 'waiting to sync' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('safe on this device');
    await notice.getByRole('button', { name: 'Details' }).click();
    await expect(page.locator('.syncstatus')).toContainText('Offline');
    await expect(page.locator('.syncstatus')).toContainText('saved on this device and will be sent when the connection returns');
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test.describe('changes the server would not take', () => {
    const refuse = json(422, { refused: 'invalid-input', current: null });

    test('are listed with the reason, and a notice says so', async ({ page }) => {
      await openSynced(page, refuse);
      await page.locator('#chk-A-d1s1').check();
      const alert = page.getByRole('alert').filter({ hasText: 'Not sent' });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText('set aside');
      // the older notice about this device's own storage would be wrong here: nothing is lost on reload
      await expect(page.getByText('couldn’t be saved on this device')).toHaveCount(0);
      await alert.getByRole('button', { name: 'Details' }).click();
      await expect(page.locator('.syncstatus')).not.toContainText('Syncing');
      await expect(page.getByRole('heading', { name: /^Not sent \(\d+\)$/ })).toBeVisible();
      await expect(page.locator('.notsent li').first()).toContainText('The server would not take this (invalid-input).');
      const { violations } = await scan(page);
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

    test('can be downloaded, with the whole document in the file', async ({ page }) => {
      await openSynced(page, refuse);
      await page.locator('#chk-A-d1s1').check();
      await openSettings(page);
      const first = page.locator('.notsent li').first();
      await expect(first).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent('download'), first.getByRole('button', { name: /^Download/ }).click()]);
      expect(download.suggestedFilename()).toMatch(/^iron-log-not-sent-\d{4}-\d{2}-\d{2}\.json$/);
      const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
      expect(file).toMatchObject({ app: 'Iron Log', kind: 'changes the server would not take' });
      expect(file.items).toHaveLength(1);
      expect(file.items[0]).toMatchObject({ reason: 'The server would not take this (invalid-input).' });
      expect(file.items[0].document).toBeTruthy();
    });

    test('are discarded only on a second press, and then the notice goes', async ({ page }) => {
      await openSynced(page, refuse);
      await page.locator('#chk-A-d1s1').check();
      await openSettings(page);
      const count = await page.locator('.notsent li').count();
      expect(count).toBeGreaterThan(0);
      for (let left = count; left > 0; left--) {
        const item = page.locator('.notsent li').first();
        await item.getByRole('button', { name: /^Discard/ }).click();
        await expect(page.locator('.notsent li')).toHaveCount(left); // one press only arms it
        await item.getByRole('button', { name: /Tap again to discard/ }).click();
        await expect(page.locator('.notsent li')).toHaveCount(left - 1);
      }
      await expect(page.getByRole('heading', { name: /^Not sent/ })).toHaveCount(0);
      await expect(page.getByRole('alert').filter({ hasText: 'Not sent' })).toHaveCount(0);
    });

    test('Try again sends it again, and says so when the server still will not take it', async ({ page }) => {
      await openSynced(page, refuse);
      await page.locator('#chk-A-d1s1').check();
      await openSettings(page);
      const before = await page.locator('.notsent li').count();
      await page.locator('.notsent li').first().getByRole('button', { name: /^Try again/ }).click();
      await expect(page.locator('.saveflag')).toContainText('would not take it this time either');
      await expect(page.locator('.notsent li')).toHaveCount(before);
    });
  });
});

// ---- The Account panel (B2e): who is signed in, sign in, sign out ----

test.describe('the Account panel', () => {
  const me = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const signedIn = { ok: true, userId: 'u1', account: { kind: 'session', email: 'ann@example.com', name: 'Ann' } };
  const settle = async (page, meAnswer, extra) => {
    if (extra) await extra(page);
    await openSynced(page, undefined, meAnswer, accountPull, { board: false });
    await page.click('#tab-settings');
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  };

  test('is not there at all when the flag is off', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
    await page.goto('/');
    await page.click('#tab-settings');
    await expect(page.getByRole('heading', { name: 'Erase data' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toHaveCount(0);
  });

  test('says who is signed in, offers Sign out, and has no accessibility violations', async ({ page }) => {
    await settle(page, me(200, signedIn));
    await expect(page.getByText('ann@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('signed out: says so, that changes are kept, and offers Google sign-in', async ({ page }) => {
    await settle(page, me(401, { ok: false, error: 'sign-in required' }));
    const panel = page.getByRole('region', { name: 'Account' });
    await expect(panel.getByText('Not signed in.')).toBeVisible();
    await expect(panel.getByText('kept on this device')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('a failed check never says signed out', async ({ page }) => {
    await settle(page, me(503, { ok: false }));
    await expect(page.getByText('Could not check who is signed in')).toBeVisible();
    await expect(page.getByText('Not signed in.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0);
  });

  test('Sign in with Google asks the server for the address and goes there', async ({ page }) => {
    let body;
    await settle(page, me(401, {}), async p => {
      await p.route('**/api/auth/sign-in/social', route => { body = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/google-says-hello', redirect: true }) }); });
      await p.route('**/google-says-hello', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google</h1>' }));
    });
    await page.getByRole('region', { name: 'Account' }).getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
    expect(body).toEqual({ provider: 'google', callbackURL: '/' });
  });

  test('Sign out calls the server, then the next screen is the landing page', async ({ page }) => {
    let out = false;
    await settle(page, route => (out ? me(401, {})(route) : me(200, signedIn)(route)), async p => {
      await p.route('**/api/auth/sign-out', route => { out = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
    });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible();
    await expect(page.locator('#tab-board')).toHaveCount(0); // the app is not behind it
    expect(await page.evaluate(() => localStorage.getItem('ironlog:session/known'))).toBeNull();
  });
});

test.describe('signed out with syncing on (the server answers 401)', () => {
  const unauth = route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'sign-in required' }) });
  const openSignedOut = async page => {
    await page.addInitScript(() => {
      localStorage.setItem('ironlog:hidetip', '1');
      localStorage.setItem('ironlog:hidelocal', '1');
      localStorage.setItem('ironlog:flag:apiSync', 'true'); if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); }
    });
    await page.route('**/api/**', unauth);
    await page.goto('/');
  };

  test('a card asks for sign-in instead of sitting on Loading', async ({ page }) => {
    await openSignedOut(page);
    const card = page.getByRole('status').filter({ hasText: 'Sign in to sync' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('kept on this device');
    await expect(card.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    await expect(page.locator('.saveflag')).not.toHaveText('Loading…');
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('the card goes to Google sign-in', async ({ page }) => {
    await openSignedOut(page);
    await page.route('**/api/auth/sign-in/social', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/google-says-hello' }) }));
    await page.route('**/google-says-hello', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google</h1>' }));
    await page.getByRole('status').filter({ hasText: 'Sign in to sync' }).getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
  });
});

test.describe('another account signs in on a device that holds the first one’s data (B2e)', () => {
  const json2 = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const bob = { ok: true, userId: 'bob', account: { kind: 'session', email: 'bob@example.com', name: 'Bob' } };

  // The device belongs to Ann and has one change she never sent. Bob is the one signed in now.
  async function openAsBob(page) {
    const seen = { sync: 0, commands: 0 };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return; // only once: a reload after the wipe must not put Ann's data back
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('ironlog:hidetip', '1');
      localStorage.setItem('ironlog:hidelocal', '1');
      localStorage.setItem('ironlog:flag:apiSync', 'true'); if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); }
      localStorage.setItem('ironlog:sync/owner', JSON.stringify({ userId: 'ann' }));
      localStorage.setItem('ironlog:sync/pending', JSON.stringify({ 'logs/hack-squat': { schema: 1, entries: [{ id: 'ann-1', d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5 }] } }));
    });
    await page.route('**/api/me', json2(bob));
    await page.route('**/api/sync*', route => { seen.sync++; return json(200, emptyPull)(route); });
    await page.route('**/api/commands/**', route => { seen.commands++; return json2({ rows: [], cursor: '1' })(route); });
    await page.goto('/');
    return seen;
  }

  test('asks what to do, sends nothing, and has no accessibility violations', async ({ page }) => {
    const seen = await openAsBob(page);
    const card = page.getByRole('alert').filter({ hasText: 'holds data from another account' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('bob@example.com');
    await expect(card).toContainText('Nothing has been sent or received');
    await expect(card.getByRole('button', { name: /Download this device/ })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Wipe it and continue' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    expect(seen).toEqual({ sync: 0, commands: 0 });
  });

  test('Download keeps a copy of everything the device held, unsent change included', async ({ page }) => {
    await openAsBob(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download this device/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^iron-log-this-device-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
    expect(file.kind).toBe('everything this device held');
    expect(file.items.map(i => i.path)).toEqual(['logs/hack-squat']);
    expect(file.items[0].document.entries[0].id).toBe('ann-1');
  });

  test('Wipe needs a second press, then the device is clean, Bob owns it and Ann’s change was never sent', async ({ page }) => {
    const seen = await openAsBob(page);
    const wipe = page.getByRole('button', { name: 'Wipe it and continue' });
    await wipe.click();
    await expect(page.getByRole('button', { name: 'Tap again to wipe this device' })).toBeVisible(); // one press only arms it
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('ironlog:sync/owner')))).toEqual({ userId: 'ann' });
    await page.getByRole('button', { name: 'Tap again to wipe this device' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'another account' })).toHaveCount(0); // reloaded, signed in as Bob, nothing blocking
    await expect(page.getByRole('region', { name: 'Build your first workout' })).toBeVisible(); // Bob is a new account: a blank board, none of Ann's cards
    await expect(page.getByRole('alert').filter({ hasText: 'another account' })).toHaveCount(0);
    const stored = await page.evaluate(() => ({ owner: localStorage.getItem('ironlog:sync/owner'), pending: localStorage.getItem('ironlog:sync/pending') }));
    expect(JSON.parse(stored.owner)).toEqual({ userId: 'bob' });
    expect(stored.pending === null || stored.pending === '{}').toBe(true);
    expect(seen.commands).toBe(0);
  });

  test('Sign out leaves the data alone and asks for sign-in', async ({ page }) => {
    await openAsBob(page);
    let out = false;
    await page.route('**/api/me', route => (out ? json2({ ok: false }, 401)(route) : json2(bob)(route)));
    await page.route('**/api/auth/sign-out', route => { out = true; return json2({ success: true })(route); });
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible(); // landing page; the device's data is untouched
    expect(await page.evaluate(() => localStorage.getItem('ironlog:sync/pending'))).toContain('ann-1');
  });
});

// ---- Phase E: the card that offers the one-time upload of data from before accounts ----

test.describe('old data on the device (the upload card)', () => {
  const seed = async page => page.addInitScript(() => {
    localStorage.setItem('ironlog:logs/hack', JSON.stringify({ schema: 1, entries: [{ d: '2026-09-14', ph: 'strength', w: 200, s: 3, r: 8 }] }));
    localStorage.setItem('ironlog:body/main', JSON.stringify({ entries: [{ wk: '2026-09-13', d: '2026-09-14', w: 181 }] }));
  });
  const offer = page => page.getByRole('status').filter({ hasText: 'Upload this device’s data?' });
  const importTo = answer => async page => { await page.route('**/api/commands/import-legacy', answer); };

  test('offers the upload with what it holds, has no accessibility violations, and sends nothing until asked', async ({ page }) => {
    let sent = 0;
    await seed(page);
    await importTo(route => { sent++; return json(201, { imported: {}, total: 0 })(route); })(page);
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await expect(offer(page)).toBeVisible();
    await expect(offer(page)).toContainText('1 logged session, 1 body weight');
    await expect(offer(page)).toContainText('Nothing is deleted from this device');
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    expect(sent).toBe(0);
    await offer(page).getByRole('button', { name: 'Not now' }).click();
    await expect(offer(page)).toHaveCount(0);
    expect(sent).toBe(0);
  });

  test('sends every row in one request, with no base version and the old ids kept', async ({ page }) => {
    let body;
    await seed(page);
    await importTo(route => { body = route.request().postDataJSON(); return json(201, { imported: { 'log-session': 1, 'log-body-weight': 1 }, total: 2 })(route); })(page);
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await offer(page).getByRole('button', { name: 'Upload' }).click();
    await expect(offer(page)).toHaveCount(0);
    expect(body.baseVersion).toBeNull();
    expect(body.input.commands.map(c => c.name).sort()).toEqual(['log-body-weight', 'log-session']);
    expect(JSON.stringify(body)).not.toMatch(/ghBackup|token/);
  });

  test('when the server refuses, says where and that nothing was uploaded, and keeps the offer', async ({ page }) => {
    await seed(page);
    await importTo(json(422, { refused: 'invalid-input', at: 1, command: 'log-body-weight' }))(page);
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await offer(page).getByRole('button', { name: 'Upload' }).click();
    await expect(offer(page)).toContainText('The server would not take row 2 (log-body-weight): invalid-input. Nothing was uploaded.');
    await expect(offer(page).getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  test('when the account already has data, says so instead of failing', async ({ page }) => {
    await seed(page);
    await importTo(json(409, { refused: 'account-not-empty' }))(page);
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await offer(page).getByRole('button', { name: 'Upload' }).click();
    await expect(offer(page)).toContainText('Your account already has data, so nothing was uploaded.');
  });

  test('is not offered when the browser holds nothing from before', async ({ page }) => {
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await expect(offer(page)).toHaveCount(0);
  });
});

// ---- Phase E, from a file: Settings → Account → Upload from an export file ----

test.describe('uploading from an export file', () => {
  const exportFile = {
    app: 'iron-log', format: 1, exportedAt: '2026-10-07T15:20:41.590Z', config: { mode: 2, ghBackup: { repo: 'a/b', token: 'ghp_secret' } },
    programs: {}, library: [], weeks: {}, experiments: [], stretchWeeks: {},
    logs: { hack: [{ d: '2026-09-14', ph: 'strength', w: 200, s: 3, r: 8 }, { d: '2026-09-21', ph: 'strength', w: 210, s: 3, r: 8 }] },
    body: [{ wk: '2026-09-13', d: '2026-09-14', w: 181 }],
  };
  const file = (obj = exportFile, name = 'iron-log-data-2026-10-07.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  const open = async (page, importAnswer) => {
    await page.route('**/api/commands/import-legacy', importAnswer);
    await openSynced(page, undefined, signedInAsDev, emptyPull);
    await page.click('#tab-settings');
    await expect(page.getByRole('heading', { name: 'Upload from an export file' })).toBeVisible();
  };
  const panel = page => page.getByRole('region', { name: 'Account' });

  test('shows what the file holds before anything is sent, then uploads it in one request', async ({ page }) => {
    let body;
    await open(page, route => { body = route.request().postDataJSON(); return json(201, { imported: { 'log-session': 2, 'log-body-weight': 1, 'save-config': 1 }, total: 4 })(route); });
    await page.locator('input[aria-label="Iron Log export file"]').setInputFiles(file());
    const summary = panel(page).getByRole('status').filter({ hasText: 'iron-log-data-2026-10-07.json' });
    await expect(summary).toContainText('2 logged sessions, 1 body weight');
    await expect(summary).toContainText('exported 2026-10-07');
    expect(body).toBeUndefined(); // nothing goes until the user says so
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await summary.getByRole('button', { name: 'Upload to my account' }).click();
    await expect(summary).toHaveCount(0);
    expect(body.input.commands).toHaveLength(4);
    expect(JSON.stringify(body)).not.toMatch(/ghp_secret|ghBackup/);
  });

  test('Cancel sends nothing', async ({ page }) => {
    let sent = 0;
    await open(page, route => { sent++; return json(201, { imported: {}, total: 0 })(route); });
    await page.locator('input[aria-label="Iron Log export file"]').setInputFiles(file());
    await panel(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page).getByRole('button', { name: 'Upload to my account' })).toHaveCount(0);
    expect(sent).toBe(0);
  });

  test('a file that is not an Iron Log export, is empty, or is too new says so', async ({ page }) => {
    await open(page, json(201, {}));
    const input = page.locator('input[aria-label="Iron Log export file"]');
    await input.setInputFiles(file('not json at all'));
    await expect(panel(page).getByRole('alert')).toContainText('isn’t valid JSON');
    await input.setInputFiles(file({ hello: 1 }));
    await expect(panel(page).getByRole('alert')).toContainText('isn’t an Iron Log data file');
    await input.setInputFiles(file({ ...exportFile, format: 99 }));
    await expect(panel(page).getByRole('alert')).toContainText('newer version');
    await input.setInputFiles(file({ app: 'iron-log', format: 1, config: {}, programs: {}, library: [], logs: {}, weeks: {}, body: [], experiments: [] }));
    await expect(panel(page).getByRole('alert')).toContainText('holds nothing to upload');
  });

  test('when the server refuses, says where and that nothing was uploaded, and keeps the file chosen', async ({ page }) => {
    await open(page, json(422, { refused: 'invalid-input', at: 0, command: 'log-session' }));
    await page.locator('input[aria-label="Iron Log export file"]').setInputFiles(file());
    await panel(page).getByRole('button', { name: 'Upload to my account' }).click();
    await expect(panel(page).getByRole('alert')).toContainText('The server would not take row 1 (log-session): invalid-input. Nothing was uploaded.');
    await expect(panel(page).getByRole('button', { name: 'Upload to my account' })).toBeEnabled();
  });
});

// ---- Phase F: delete my data, and the legal pages ----

test.describe('Delete my data', () => {
  const open = async (page, answers = {}) => {
    const calls = [];
    for (const [path, answer] of Object.entries(answers)) {
      await page.route(`**${path}`, route => { calls.push({ path, body: route.request().postDataJSON() }); return answer(route); });
    }
    await openSynced(page);
    await page.click('#tab-settings');
    await expect(page.getByRole('heading', { name: 'Delete my data' })).toBeVisible();
    return calls;
  };
  const ok = route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  const panel = page => page.getByRole('region', { name: 'Delete my data' });

  test('is there only when signed in, says what it does, and has no accessibility violations', async ({ page }) => {
    await open(page);
    await expect(panel(page)).toContainText('for good');
    await expect(panel(page)).toContainText('within 30 days');
    await expect(panel(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy.html');
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('is not shown when signed out', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); } });
    await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
    await page.goto('/');
    await page.click('#tab-settings');
    await expect(page.getByRole('heading', { name: 'Erase data' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delete my data' })).toHaveCount(0);
  });

  test('each button stays off until its exact word is typed', async ({ page }) => {
    await open(page);
    const erase = panel(page).getByRole('button', { name: 'Erase everything permanently' });
    const del = panel(page).getByRole('button', { name: 'Delete my account permanently' });
    await expect(erase).toBeDisabled();
    await expect(del).toBeDisabled();
    await panel(page).getByLabel(/Type ERASE/).fill('erase');
    await expect(erase).toBeDisabled(); // not the exact word
    await panel(page).getByLabel(/Type ERASE/).fill('ERASE');
    await expect(erase).toBeEnabled();
    await expect(del).toBeDisabled(); // the other word is its own
  });

  test('erase sends the word, forgets this device\'s own copy, and reloads', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('ironlog:logs/hack', JSON.stringify({ schema: 1, entries: [{ d: '2026-09-14', w: 200, s: 3, r: 8 }] })); // from before accounts
    });
    const calls = await open(page, { '/api/account/erase-data': ok });
    await panel(page).getByLabel(/Type ERASE/).fill('ERASE');
    await panel(page).getByRole('button', { name: 'Erase everything permanently' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].body).toEqual({ confirm: 'ERASE' });
    await expect(page.getByRole('heading', { name: 'Delete my data' })).toBeVisible(); // reloaded: the app reopens on the tab it was on
    const left = await page.evaluate(() => ({ docs: localStorage.getItem('ironlog:logs/hack'), mirror: localStorage.getItem('ironlog:sync/mirror'), marker: localStorage.getItem('ironlog:sync/legacy') }));
    expect(left.docs).toBeNull();
    expect(left.marker).toContain('dismissed'); // the erased old data is never offered for upload again
  });

  test('delete account sends its own word', async ({ page }) => {
    const calls = await open(page, { '/api/account/delete': ok });
    await panel(page).getByLabel(/Type DELETE/).fill('DELETE');
    await panel(page).getByRole('button', { name: 'Delete my account permanently' }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].body).toEqual({ confirm: 'DELETE' });
  });

  test('when the server cannot do it, says nothing was erased and keeps the data here', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('ironlog:logs/hack', JSON.stringify({ schema: 1, entries: [{ d: '2026-09-14', w: 200, s: 3, r: 8 }] })); } });
    await open(page, { '/api/account/erase-data': route => route.abort() });
    await panel(page).getByLabel(/Type ERASE/).fill('ERASE');
    await panel(page).getByRole('button', { name: 'Erase everything permanently' }).click();
    await expect(panel(page).getByRole('alert')).toContainText('Nothing was erased');
    expect(await page.evaluate(() => localStorage.getItem('ironlog:logs/hack'))).toContain('"w":200');
    await expect(panel(page).getByRole('button', { name: 'Erase everything permanently' })).toBeEnabled();
  });
});

test.describe('the legal pages', () => {
  for (const [file, heading] of [['privacy.html', 'Privacy Policy'], ['terms.html', 'Terms of Use']]) {
    test(`${file} loads, names the operator and contact, and has no accessibility violations`, async ({ page }) => {
      await page.goto(`/${file}`);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText('Joshua Carpentier').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'joshuaxcarpentier@gmail.com' }).first()).toHaveAttribute('href', 'mailto:joshuaxcarpentier@gmail.com');
      const { violations } = await scan(page);
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('the sign-in card links to both', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); } });
    await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
    await page.goto('/');
    const card = page.getByRole('status').filter({ hasText: 'Sign in to sync' });
    await expect(card.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms.html');
    await expect(card.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy.html');
    await expect(card).toContainText('creates your account the first time');
  });
});


// ---- The landing page: what a visitor this browser has never seen signed in gets, instead of the app ----

test.describe('the landing page', () => {
  const unauth = route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false,"error":"sign-in required"}' });
  const stranger = async (page, me = unauth, extra) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); });
    await page.route('**/api/**', unauth);
    await page.route('**/api/me', me);
    if (extra) await extra(page);
    await page.goto('/');
  };
  const heading = page => page.getByRole('heading', { level: 1, name: /A weekly training board/ });

  test('a stranger gets the landing page, with the app nowhere behind it, and no accessibility violations', async ({ page }) => {
    await stranger(page);
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    await expect(page.getByText('creates your account the first time')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms.html');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy.html');
    await expect(page.getByText('aged 16 and over')).toBeVisible();
    await expect(page.locator('#tab-board, #tab-settings, #chk-A-d1s1')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /development user/i })).toHaveCount(0); // the dev-only skip button is not in a production build
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('the app never starts behind it: no sync, no reads of anything, only the one who-is-this question', async ({ page }) => {
    const asked = [];
    await stranger(page, unauth, async p => { p.on('request', r => { if (r.url().includes('/api/')) asked.push(new URL(r.url()).pathname); }); });
    await expect(heading(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(asked).toEqual(['/api/me']);
  });

  test('Sign in with Google asks the server for the address and goes there', async ({ page }) => {
    let body;
    await stranger(page, unauth, async p => {
      await p.route('**/api/auth/sign-in/social', route => { body = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/google-says-hello' }) }); });
      await p.route('**/google-says-hello', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google</h1>' }));
    });
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
    expect(body).toEqual({ provider: 'google', callbackURL: '/' });
  });

  test('when sign-in cannot start, says so in place and lets the visitor try again', async ({ page }) => {
    await stranger(page, unauth, async p => { await p.route('**/api/auth/sign-in/social', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })); });
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not reach the server to sign in');
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  });

  test('a visitor who signs in goes to the app, and the browser remembers, so the next visit has no check at all', async ({ page }) => {
    await stranger(page, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, userId: 'u1', account: { kind: 'session', email: 'a@b.co', name: 'A' } }) }), async p => {
      await p.route('**/api/sync*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cursor: '0', more: false }) }));
    });
    await expect(page.locator('#tab-board')).toBeVisible(); // the app, not a page in front of it (nothing is loaded in these, so no cards)
    await expect(heading(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('ironlog:session/known'))).toBe('true');
  });

  test('offline, with nothing here yet: the landing page says to connect, instead of a blank app', async ({ page }) => {
    await stranger(page, route => route.abort());
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible();
  });

  test('offline, on a device that already holds an account\'s data: straight to the app, never a page in front of it', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true');
      localStorage.setItem('ironlog:sync/owner', JSON.stringify({ userId: 'ann' }));
    });
    await page.route('**/api/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#tab-board')).toBeVisible(); // the app, not a page in front of it (nothing is loaded in these, so no cards)
    await expect(heading(page)).toHaveCount(0);
  });

  test('a known browser whose session has expired gets the app and its sign-in card, not the landing page', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
    });
    await page.route('**/api/**', unauth);
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: 'Sign in to sync' })).toBeVisible();
    await expect(page.locator('#tab-board')).toBeVisible();
    await expect(heading(page)).toHaveCount(0);
  });

  test('with syncing off (GitHub Pages) the app is always there, with no landing page and no request to the server', async ({ page }) => {
    const asked = [];
    page.on('request', r => { if (r.url().includes('/api/')) asked.push(r.url()); });
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); });
    await page.goto('/');
    await expect(page.locator('#tab-board')).toBeVisible(); // the app, not a page in front of it (nothing is loaded in these, so no cards)
    await expect(heading(page)).toHaveCount(0);
    expect(asked).toEqual([]);
  });
});
