import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Syncing through the API is behind a flag (feature-flags.md). These run with it on and the API answering as scripted;
// there is no real API behind `vite preview`, so every /api request is intercepted.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

async function open(page, answer) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
  });
  await page.route('**/api/**', answer);
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
    if (url.includes('/api/sync')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cursor: '0', more: false }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await expect(page.locator('#chk-A-d1s1')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Update needed' })).toHaveCount(0);
  await page.locator('#chk-A-d1s1').check(); // writes go out as commands; the 404 is a server problem, so they wait and nothing breaks
  await expect(page.locator('#chk-A-d1s1')).toBeChecked();
});

// ---- The sync screen (D6): status, changes waiting, changes the server would not take ----

const emptyPull = { rows: [], cursor: '0', more: false };
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The server answers pulls normally, so the app finishes loading; `commands` decides what it says to every write.
async function openSynced(page, commands) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
  });
  await page.route('**/api/sync*', json(200, emptyPull));
  if (commands) await page.route('**/api/commands/**', commands);
  await page.goto('/');
  await expect(page.locator('#chk-A-d1s1')).toBeVisible();
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
    await page.route('**/api/me', meAnswer);
    if (extra) await extra(page);
    await openSynced(page);
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
    await expect(page.getByText('Not signed in.')).toBeVisible();
    await expect(page.getByText('kept on this device')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
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
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
    expect(body).toEqual({ provider: 'google', callbackURL: '/' });
  });

  test('Sign out calls the server, then shows signed out', async ({ page }) => {
    let out = false;
    await settle(page, route => (out ? me(401, {})(route) : me(200, signedIn)(route)), async p => {
      await p.route('**/api/auth/sign-out', route => { out = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
    });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('Not signed in.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  });
});

test.describe('signed out with syncing on (the server answers 401)', () => {
  const unauth = route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'sign-in required' }) });
  const openSignedOut = async page => {
    await page.addInitScript(() => {
      localStorage.setItem('ironlog:hidetip', '1');
      localStorage.setItem('ironlog:hidelocal', '1');
      localStorage.setItem('ironlog:flag:apiSync', 'true');
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
