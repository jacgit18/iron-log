import { test, expect } from './fixtures.js';

// QA: no wipe card after a persona switch or Return (brief qa-auto-wipe-on-switch). The rule is a unit test (src/lib/qaSwitchWipe.test.ts); this covers
// the wiring a node test cannot see: the stamp, the card staying hidden, the wipe and the reload, and that the card still asks without a stamp.
// The device belongs to Ann and holds one unsent change; Bob is signed in. QA mode is faked by what /api/me says, as in qaPicker.spec.js.
const json = (body, status = 200) => route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const bob = { ok: true, userId: 'bob', qa: { persona: 'New user', canSwitch: false }, account: { kind: 'session', email: 'bob@example.com', name: 'Bob' } };

async function openAsBob(page, { stamp }) {
  await page.addInitScript(withStamp => {
    if (sessionStorage.getItem('seeded')) return; // only once: the reload after the wipe must not put Ann's data back
    sessionStorage.setItem('seeded', '1');
    if (withStamp) sessionStorage.setItem('qa-switched', String(Date.now()));
    for (const [k, v] of [['hidetip', '1'], ['hidelocal', '1'], ['flag:apiSync', 'true'], ['session/known', 'true']]) localStorage.setItem('ironlog:' + k, v);
    localStorage.setItem('ironlog:sync/owner', JSON.stringify({ userId: 'ann' }));
    localStorage.setItem('ironlog:sync/pending', JSON.stringify({ 'logs/hack-squat': { schema: 1, entries: [{ id: 'ann-1', d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5 }] } }));
  }, stamp);
  await page.route('**/api/me', json(bob));
  await page.route('**/api/sync*', json({ rows: [], cursor: '0', more: false }));
  await page.route('**/api/commands/**', json({ rows: [], cursor: '1' }));
  await page.goto('/');
}

test('after a switch the other account is wiped by itself, with no card', async ({ page }) => {
  await openAsBob(page, { stamp: true });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ironlog:sync/pending'))).toBeNull(); // Ann's unsent change is gone
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('qa-switched'))).toBeNull(); // the stamp was used once
  await expect(page.getByRole('alert').filter({ hasText: 'holds data from another account' })).toHaveCount(0);
});

test('with no stamp the card still asks, even on QA', async ({ page }) => {
  await openAsBob(page, { stamp: false });
  await expect(page.getByRole('alert').filter({ hasText: 'holds data from another account' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ironlog:sync/pending'))).not.toBeNull();
});
