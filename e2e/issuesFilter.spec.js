import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// The admin Issues status filter as a FilterSelect dropdown. The answers are stubbed here: the filter's wiring (value to request, counts in the
// option text, the clear button) is what a node test cannot see.
const row = (fp, status, message) => ({ fingerprint: fp, kind: 'error', message, topFrame: '', page: '/x', firstSeen: '2026-10-16T10:00:00Z', lastSeen: '2026-10-16T11:00:00Z', occurrences: 1, firstVersion: '9', lastVersion: '9', status, note: '' });
const ISSUES = [row('aaaaaaaaaaaa', 'open', 'Open one'), row('bbbbbbbbbbbb', 'investigating', 'Investigating one'), row('cccccccccccc', 'fixed', 'Fixed one'), row('dddddddddddd', 'fixed', 'Fixed two')];
const COUNTS = { fixed: 2, ignored: 0, investigating: 1, open: 1 };

async function open(page) {
  const asked = [];
  await page.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:session/admin', 'true');
  });
  await page.route('**/api/issues**', route => {
    const wanted = new URL(route.request().url()).searchParams.get('status');
    asked.push(wanted);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, counts: COUNTS, issues: ISSUES.filter(i => !wanted || i.status === wanted) }) });
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('#tab-settings, #account-badge').first().click();
  const panel = page.getByRole('region', { name: 'Production issues' });
  await panel.getByRole('button', { name: 'Show issues' }).click();
  return { panel, asked };
}

test('the status filter is one dropdown with counts; choosing a status asks for it, All and the clear button ask for everything', async ({ page }) => {
  const { panel, asked } = await open(page);
  const status = panel.getByRole('combobox', { name: 'Status' });
  await expect(status).toHaveValue('open');
  await expect(panel.getByRole('button', { name: /Open one/ })).toBeVisible();
  await expect(status.locator('option')).toHaveText(['All (4)', 'Open (1)', 'Investigating (1)', 'Fixed (2)', 'Ignored (0)']);
  await expect(panel.getByRole('button', { name: 'Clear Status filter' })).toBeVisible();
  await status.selectOption('fixed');
  await expect(panel.getByRole('button', { name: /Fixed two/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Open one/ })).toHaveCount(0);
  expect(asked.at(-1)).toBe('fixed');
  await panel.getByRole('button', { name: 'Clear Status filter' }).click();
  await expect(status).toHaveValue('');
  await expect(panel.getByRole('button', { name: /Open one/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Fixed two/ })).toBeVisible();
  expect(asked.at(-1)).toBeNull();
  await expect(panel.getByRole('button', { name: 'Clear Status filter' })).toHaveCount(0);
});

test('the dropdown passes the accessibility scan and does not scroll the page sideways at 375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const { panel } = await open(page);
  await expect(panel.getByRole('combobox', { name: 'Status' })).toBeVisible();
  const scan = await new AxeBuilder({ page }).include('section[aria-labelledby="issues-h"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(scan.violations.map(v => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
