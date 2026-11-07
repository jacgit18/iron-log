// Signs a browser in as a seeded QA test account (server/qa/personas.ts) on the real stack of playwright.qa.config.js, with the same
// seed code the QA database uses (seedPersona), so a scenario's steps run on the data its account starts with.
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';
import { personaAuthId, personaEmail, personaById } from '../server/qa/personas.ts';
import { SEED_EXERCISE_IDS, seedPersona } from '../server/qa/seedPersona.ts';
import { buildPersonaRows } from '../server/qa/seedPlan.ts';

export const NOW = new Date('2026-09-24T18:30:00-04:00'); // a fixed Thursday, as in the other browser tests
const PASSWORD = 'correct horse battery staple';
const plain = { seal: s => s, sealStable: s => s, open: s => s, isSealed: () => false }; // the test server has no PII key, so names and emails are stored as typed


// The server limits sign-in to 10 a minute per address (AUTH_LIMITS in server/app.ts), and one run signs in once per scenario, so spread the sign-ins
// out: never more than 9 in any 60 seconds. The tests run one at a time in one process, so a list here is enough.
const WINDOW_MS = 60_000;
const signIns = [];
async function pace() {
  for (;;) {
    const now = Date.now();
    while (signIns.length && now - signIns[0] >= WINDOW_MS) signIns.shift();
    if (signIns.length < 9) { signIns.push(now); return; }
    await new Promise(r => setTimeout(r, signIns[0] + WINDOW_MS - now + 250));
  }
}

/** Seeds the account (a fresh start every time) and gives it a password only this test knows. */
async function seed(id) {
  const persona = personaById(id);
  if (!persona) throw new Error(`no QA test account ${id}`);
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    await seedPersona(client, plain, persona, buildPersonaRows(persona, SEED_EXERCISE_IDS, NOW), NOW);
    const userId = personaAuthId(id);
    await client.query(
      `insert into auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())
       on conflict (id) do update set password = excluded.password`,
      [`qa-smoke-${id}`, userId, await hashPassword(PASSWORD)]);
  } finally { await client.end(); }
}

/** A page signed in as the account, with the clock fixed and the usual tips hidden. */
export async function signInAs(browser, id, { viewport = { width: 1440, height: 900 } } = {}) {
  await seed(id);
  await pace();
  const context = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/New_York', viewport });
  await context.addInitScript(() => {
    localStorage.setItem('ironlog:hidetip', '1');
    localStorage.setItem('ironlog:hidelocal', '1');
    localStorage.setItem('ironlog:flag:apiSync', 'true');
    if (!sessionStorage.getItem('knownSeeded')) { sessionStorage.setItem('knownSeeded', '1'); localStorage.setItem('ironlog:session/known', '1'); }
  });
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  // The pacing above lives in this process, the server's limiter in the server's: after a failed test Playwright starts a new worker with an empty
  // list while the server still counts. So a 429 is also waited out here (Retry-After, else 15 s) and tried again.
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await page.request.post('/api/auth/sign-in/email', { data: { email: personaEmail(id), password: PASSWORD } });
    if (res.status() !== 429) break;
    await new Promise(r => setTimeout(r, (Number(res.headers()['retry-after']) || 15) * 1000));
  }
  if (res.status() !== 200) throw new Error(`could not sign in as ${id}: HTTP ${res.status()}`);
  await page.goto('/');
  return { context, page };
}
