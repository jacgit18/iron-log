import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// A new signed-in account's empty board offers starter programs (ADR 041). The API is scripted, as in sync.spec.js: an account with nothing in it.
const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const signedIn = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, userId: 'dev-user', account: { kind: 'dev', email: null, name: null } }) });
const emptyPull = { rows: [], cursor: '0', more: false };

async function openNewAccount(page) {
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', 'true'); }
  });
  await page.route('**/api/**', route => (route.request().url().includes('/api/sync')
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyPull) })
    : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })));
  await page.route('**/api/me', signedIn);
  await page.goto('/');
}

test('a new account picks a starter and gets its cards on the first days, without the prompt', async ({ page }) => {
  await openNewAccount(page);
  const prompt = page.getByRole('region', { name: 'Build your first workout' });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await prompt.getByRole('button', { name: 'Use Upper / Lower, 4 days a week' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.locator('#chk-A-d1s1')).toBeVisible();
  await expect(page.getByText('Bench press').first()).toBeVisible();
  await expect(page.getByText('Squat').first()).toBeVisible();
});

test('the days-a-week choice changes how many days are filled', async ({ page }) => {
  await openNewAccount(page);
  const prompt = page.getByRole('region', { name: 'Build your first workout' });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByLabel('Push / Pull / Legs days a week').selectOption('6');
  await prompt.getByRole('button', { name: 'Use Push / Pull / Legs, 6 days a week' }).click();
  await expect(page.locator('#chk-A-d6s1')).toBeVisible();
  await expect(page.locator('#chk-A-d7s1')).toHaveCount(0);
});

test('build my own still opens the add-exercise sheet', async ({ page }) => {
  await openNewAccount(page);
  const prompt = page.getByRole('region', { name: 'Build your first workout' });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByRole('button', { name: /Build my own/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /Add exercise/ })).toBeVisible();
});
