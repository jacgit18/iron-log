// The admin side of the QA-mode run (playwright.qaMode.config.js): the scratch database is marked as QA's, and an admin signs in, so the account switcher
// that only the QA service shows (server/auth/qaPersonas.ts) can be walked for real.
import pg from 'pg';
import { PERSONAS, personaAuthId } from '../server/qa/personas.ts';

export const ADMIN_EMAIL = 'qa-admin@example.com'; // the one ADMIN_EMAILS of the QA-mode server
const PASSWORD = 'correct horse battery staple';
export const NOW = new Date('2026-09-24T18:30:00-04:00');

/** Puts the QA mark on the scratch database (what scripts/qa-db.mjs reset does on the real QA branch) and removes any seeded test accounts. Owner access, local database only. */
export async function markScratchAsQa() {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows: [{ db }] } = await client.query('select current_database() as db');
    await client.query(`comment on database "${db.replace(/"/g, '""')}" is 'iron-log qa'`);
    // The other half of the run seeds test accounts into the same scratch database: start this one with none, as a fresh QA branch has.
    for (const p of PERSONAS) {
      await client.query('delete from users where auth_user_id = $1', [personaAuthId(p.id)]);
      await client.query('delete from auth."user" where id = $1', [personaAuthId(p.id)]);
    }
  } finally { await client.end(); }
}

/** A page signed in as the admin: signs the account up (once), verifies its email, signs in. */
export async function signInAsAdmin(browser) {
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/New_York', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', '1'); }
  });
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  const up = await page.request.post('/api/auth/sign-up/email', { data: { email: ADMIN_EMAIL, password: PASSWORD, name: 'QA Admin' } });
  if (![200, 422].includes(up.status())) throw new Error(`could not sign the admin up: HTTP ${up.status()}`); // 422: already signed up in an earlier test
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try { await client.query('update auth."user" set "emailVerified" = true where email = $1', [ADMIN_EMAIL]); } finally { await client.end(); }
  const res = await page.request.post('/api/auth/sign-in/email', { data: { email: ADMIN_EMAIL, password: PASSWORD } });
  if (res.status() !== 200) throw new Error(`could not sign in as the admin: HTTP ${res.status()}`);
  await page.goto('/');
  return { context, page };
}
