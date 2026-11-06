import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The "I agree to the Terms and the Privacy Policy" box on every sign-in surface, and the accept screen for a signed-in account that has not accepted
// (brief terms-acceptance). There is no real API behind `vite preview`, so every /api request is scripted. The unit tests cover the decision
// (src/lib/termsGate.test.ts) and the version match (src/shared/termsVersion.test.ts); this covers the wiring: the buttons, the screen, the calls.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const AGREE = /I agree to the Terms of Use/;
const emptyPull = { rows: [], cursor: '0', more: false };

// The versions the bundle asks for, read from the page's own constants so a bump does not break this spec.
async function current(page) {
  const find = async f => /Version (\d+\.\d+)/.exec(await (await page.request.get(`/${f}`)).text())?.[1];
  return { terms: await find('terms.html'), privacy: await find('privacy.html') };
}

async function stranger(page) {
  await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); });
  await page.route('**/api/**', json(401, { ok: false, error: 'sign-in required' }));
  await page.route('**/api/auth-options', json(200, { ok: true, emailCode: true }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible();
}

// A returning browser (it has seen a signed-in session) whose account holds `stored` versions; `accepted` flips after a successful accept call.
async function signedIn(page, { stored = { terms: null, privacy: null }, acceptStatus = 200, tick = false } = {}) {
  const state = { accepted: false, accepts: [], pulls: 0 };
  await page.addInitScript(tickNow => {
    localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true');
    if (tickNow && !sessionStorage.getItem('tickSeeded')) { sessionStorage.setItem('tickSeeded', '1'); sessionStorage.setItem('terms/ticked', String(Date.now())); }
  }, tick);
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (url.includes('/api/me')) return json(200, { ok: true, userId: 'u1', account: { kind: 'session', email: 'ann@example.com', name: 'Ann', terms: { ...stored, accepted: state.accepted } } })(route);
    if (url.includes('/api/terms/accept')) {
      state.accepts.push(route.request().postDataJSON());
      if (acceptStatus === 200) state.accepted = true;
      return json(state.accepted ? 200 : acceptStatus, { ok: state.accepted })(route);
    }
    if (url.includes('/api/sync')) { state.pulls += 1; return json(200, emptyPull)(route); }
    return json(404, {})(route);
  });
  await page.goto('/');
  return state;
}

test.describe('the sign-in box', () => {
  test('is unticked, links both pages, and keeps both sign-in buttons off until ticked', async ({ page }) => {
    await stranger(page);
    const box = page.getByRole('checkbox', { name: AGREE });
    await expect(box).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'Terms of Use' }).first()).toHaveAttribute('href', '/terms.html');
    await expect(page.getByRole('link', { name: 'Privacy Policy' }).first()).toHaveAttribute('href', '/privacy.html');
    await expect(page.getByText('Tick the box to sign in.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign in with email' })).toBeDisabled();
    await box.check();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sign in with email' })).toBeEnabled();
    await expect(page.getByText('Tick the box to sign in.')).toHaveCount(0);
    await box.uncheck();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeDisabled();
  });

  test('is never pre-ticked: a reload starts unticked', async ({ page }) => {
    await stranger(page);
    await page.getByRole('checkbox', { name: AGREE }).check();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: AGREE })).not.toBeChecked();
  });

  test('has no accessibility violations and a tap target of at least 24 px', async ({ page }) => {
    await stranger(page);
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    const size = await page.getByRole('checkbox', { name: AGREE }).boundingBox();
    expect(size.width).toBeGreaterThanOrEqual(24);
    expect(size.height).toBeGreaterThanOrEqual(24);
  });
});

test.describe('the accept screen', () => {
  test('an existing account sees only that screen, and ticking then Continue opens the app', async ({ page }) => {
    const state = await signedIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Before you continue' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /board/i })).toHaveCount(0); // the app is not behind it
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const go = page.getByRole('button', { name: 'Continue' });
    await expect(go).toBeDisabled();
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.getByRole('checkbox', { name: AGREE }).check();
    await go.click();
    await expect(page.getByRole('tab', { name: /board/i })).toBeVisible();
    expect(state.accepts).toEqual([await current(page)]); // exactly the versions the pages show
  });

  test('changes sync while it is up, so nothing queued on the device is held back or dropped', async ({ page }) => {
    const state = await signedIn(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Before you continue' })).toBeVisible();
    await expect.poll(() => state.pulls, { timeout: 30_000 }).toBeGreaterThan(0); // the store keeps syncing behind the screen
    await page.getByRole('checkbox', { name: AGREE }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('tab', { name: /board/i })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /paused|Update needed|Could not/ })).toHaveCount(0);
  });

  test('after a version change it says which page changed', async ({ page }) => {
    const cur = await current(page);
    await signedIn(page, { stored: { terms: '0.1', privacy: cur.privacy } });
    await expect(page.getByRole('heading', { level: 1, name: 'We updated our Terms of Use' })).toBeVisible();
  });

  test('a failed save keeps the screen and offers another try', async ({ page }) => {
    const state = await signedIn(page, { acceptStatus: 503 });
    await page.getByRole('checkbox', { name: AGREE }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not save your answer' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /board/i })).toHaveCount(0);
    expect(state.accepts).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('an account that accepted is never shown it', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); localStorage.setItem('ironlog:session/known', 'true'); });
    await page.route('**/api/**', route => (route.request().url().includes('/api/me') ? json(200, { ok: true, userId: 'u1', account: { kind: 'session', email: 'ann@example.com', name: 'Ann', terms: { terms: '1.0', privacy: '1.0', accepted: true } } })(route) : json(200, emptyPull)(route)));
    await page.goto('/');
    await expect(page.getByRole('tab', { name: /board/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Before you continue' })).toHaveCount(0);
  });

  test('a tick made on the sign-in card is posted on return, so the person is not asked twice', async ({ page }) => {
    const state = await signedIn(page, { tick: true });
    await expect(page.getByRole('tab', { name: /board/i })).toBeVisible({ timeout: 30_000 });
    expect(state.accepts).toHaveLength(1);
    expect(await page.evaluate(() => sessionStorage.getItem('terms/ticked'))).toBeNull();
  });
});
