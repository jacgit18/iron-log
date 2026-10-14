import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Sign in with an emailed code (ADR 042) on the landing page. There is no real API behind `vite preview`, so every /api call is scripted.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const json = (status, body) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function stranger(page, { open = false, sendStatus = 200, signInStatus = 200, url = '/' } = {}) {
  const calls = { send: [], signIn: [] };
  await page.addInitScript(() => { localStorage.setItem('ironlog:hidetip', '1'); localStorage.setItem('ironlog:hidelocal', '1'); localStorage.setItem('ironlog:flag:apiSync', 'true'); });
  await page.route('**/api/**', json(401, { ok: false, error: 'sign-in required' }));
  await page.route('**/api/auth-options', json(200, { ok: true, emailCode: open }));
  await page.route('**/api/auth/email-otp/send-verification-otp', route => { calls.send.push(route.request().postDataJSON()); return json(sendStatus, { success: true })(route); });
  await page.route('**/api/auth/sign-in/email-otp', route => { calls.signIn.push(route.request().postDataJSON()); return json(signInStatus, signInStatus === 200 ? { token: 't' } : { message: 'INVALID_OTP' })(route); });
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: /A weekly training board/ })).toBeVisible();
  return calls;
}

test.describe('sign in with an emailed code', () => {
  test('is not offered while the server says it is closed, and nothing reveals it by accident', async ({ page }) => {
    await stranger(page);
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sign in with email' })).toHaveCount(0);
  });

  test('is offered to everyone once the server says it is open', async ({ page }) => {
    await stranger(page, { open: true });
    await expect(page.getByRole('button', { name: 'Sign in with email' })).toBeVisible();
  });

  test('opening the address with ?email-signin reveals it on this device, and it stays', async ({ page }) => {
    await stranger(page, { url: '/?email-signin' });
    await expect(page.getByRole('button', { name: 'Sign in with email' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sign in with email' })).toBeVisible();
  });

  test('address, then code: asks for the code, signs in with it, and has no accessibility violations', async ({ page }) => {
    const calls = await stranger(page, { open: true });
    await page.getByRole('button', { name: 'Sign in with email' }).click();
    await page.getByLabel('Email').fill('ann@example.com');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText(/6-digit code is on its way/)).toBeVisible();
    expect(calls.send).toEqual([{ email: 'ann@example.com', type: 'sign-in' }]);
    const code = page.getByLabel(/6-digit code sent to ann@example.com/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled(); // not until all six digits are in
    const { violations } = await scan(page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await code.fill('12a345 6');
    await expect(code).toHaveValue('123456'); // digits only, six at most
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect.poll(() => calls.signIn).toEqual([{ email: 'ann@example.com', otp: '123456' }]);
  });

  test('a mistyped address is not sent', async ({ page }) => {
    const calls = await stranger(page, { open: true });
    await page.getByRole('button', { name: 'Sign in with email' }).click();
    await page.getByLabel('Email').fill('not an address');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Enter the email address you sign in with.')).toBeVisible();
    expect(calls.send).toEqual([]);
  });

  test('a wrong code says so in words and stays on the code step', async ({ page }) => {
    await stranger(page, { open: true, signInStatus: 400 });
    await page.getByRole('button', { name: 'Sign in with email' }).click();
    await page.getByLabel('Email').fill('ann@example.com');
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel(/6-digit code sent to/).fill('000000');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(/That code did not work/)).toBeVisible();
    await expect(page.getByLabel(/6-digit code sent to/)).toBeVisible();
  });

  test('the rate limit is told in words and the form stays on the address step', async ({ page }) => {
    await stranger(page, { open: true, sendStatus: 429 });
    await page.getByRole('button', { name: 'Sign in with email' }).click();
    await page.getByLabel('Email').fill('ann@example.com');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Too many tries. Wait a minute, then try again.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('a new code cannot be asked for in the first 30 seconds', async ({ page }) => {
    await stranger(page, { open: true });
    await page.getByRole('button', { name: 'Sign in with email' }).click();
    await page.getByLabel('Email').fill('ann@example.com');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
    await page.getByRole('button', { name: 'Use a different email' }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
