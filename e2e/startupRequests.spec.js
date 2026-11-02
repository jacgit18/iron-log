import { test, expect } from '@playwright/test';

// First-load cost (brief startup-cheap-wins): /api/me is asked once however many parts of the app want the answer, the Icon stylesheet is in the
// page instead of a second blocking request, and a production host never downloads the QA-only chunks. A unit test cannot see a real request count or the built page.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const me = { ok: true, userId: 'u1', account: { kind: 'session', email: 'jo@example.com', name: 'Jo Lifter', isAdmin: false } };

test('a signed-in load asks /api/me once, links no stylesheet in the page and fetches no QA chunk', async ({ page }) => {
  let meCalls = 0;
  const files = [];
  page.on('request', r => files.push(new URL(r.url()).pathname));
  await page.addInitScript(() => {
    for (const [k, v] of [['hidetip', '1'], ['hidelocal', '1'], ['flag:apiSync', 'true'], ['session/known', 'true']]) localStorage.setItem('ironlog:' + k, v);
  });
  await page.route('**/api/**', json({ ok: false }, 401));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/me', route => { meCalls++; return json(me)(route); });
  await page.goto('/');
  await expect(page.locator('#account-badge')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(meCalls).toBe(1);
  // The served page, not the live DOM: a lazy tab adds its own stylesheet link later, which is fine.
  expect(await (await page.request.get('/')).text()).not.toMatch(/<link[^>]*rel="stylesheet"/);
  expect(files.filter(f => /\/assets\/Qa(Banner|DeepLink)-/.test(f))).toEqual([]);
});
