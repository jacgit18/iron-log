#!/usr/bin/env node
// The local stack the QA Runner agent works on (brief: qa-runner-agent, agent file .claude/agents/qa-scenario-runner.md). The limits of the agent are
// enforced here, in code, because an agent's tool list cannot say which host or database it may touch:
//   - the only server it gets is one this script starts, bound to 127.0.0.1 (HOST=127.0.0.1) on a port the OS picks; check-url accepts only that server's address;
//   - the only database is a scratch one this script creates (named iron_qa_run_<8 hex>, marked with a comment) on a Postgres that is on this machine;
//   - stop drops only what the state file says this script made, and only if the name and the mark still match.
// Usage (run with tsx, because seeding reads the TypeScript seed code):
//   npx tsx scripts/qa-local.mjs start                 builds the app (skip with --no-build), makes the scratch database, starts the server, prints the URL as JSON
//   npx tsx scripts/qa-local.mjs seed <persona-id>     seeds one test account from server/qa/personas.ts (or `qa-local-admin`, the stack's one test admin, for the picker) and prints its email and the URL
//   npx tsx scripts/qa-local.mjs check-url <url>       exits 1 unless the URL is on this machine (the agent runs this before opening any address)
//   npx tsx scripts/qa-local.mjs status | stop         stop kills the server and drops the scratch database and login (safe to run twice)
// DATABASE_URL (or QA_LOCAL_PG) names the local Postgres server to make the scratch database on; default postgres://ironlog:ironlog@127.0.0.1:5433/ironlog
// (the `npm run db:start` container). The database named in it is never written to: only a new database next to it is.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, openSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
export const SCRATCH_PREFIX = 'iron_qa_run_';
export const SCRATCH_MARK = 'iron-log qa-local scratch';
// The scratch stack's test admin, its password and the picker settings live in server/qa/localAdmin.ts, imported inside `start` and `seed` only (a TypeScript file: status, stop and check-url, which the Runner's hook relies on, must not need Node's TypeScript support).
// What e2e-qa/persona.js sets before sign-in: without apiSync the app shows this browser's own (empty) data, not the seeded account's.
export const BROWSER_FLAGS = { 'ironlog:hidetip': '1', 'ironlog:hidelocal': '1', 'ironlog:flag:apiSync': 'true', 'ironlog:session/known': '1' };
// One page and one script per persona: the server sends static files with `Cache-Control: max-age=3600`, so a shared name made the browser reuse the previous persona's
// script and sign in as the wrong account (found in the S-271 run, 2026-11-14). A name per persona has the same content every time, so a cached copy is always right.
export const signInNames = personaId => ({ page: `qa-signin-${personaId}.html`, script: `qa-signin-${personaId}.js` });
const SIGNIN_FILE = /^qa-signin-[a-z0-9-]+\.(html|js)$/;

/** The sign-in files among a folder's file names (`null` = the folder does not exist, e.g. a start that failed before the build): only qa-signin-<persona>.html and .js, nothing else. */
export const signInFilesIn = names => (names ?? []).filter(n => SIGNIN_FILE.test(n));
/** A new token for each `seed`, put in the printed address and in the script address inside the page, so the browser's one-hour cache never serves an earlier seed's copy (the guard checks only the origin, so a query string passes). */
export const seedToken = (bytes = randomBytes(6)) => Buffer.from(bytes).toString('hex');
/** Deletes the sign-in files (they hold the scratch test password) from `dist`; a missing folder is fine. */
export function removeSignInFiles(distDir) {
  for (const f of signInFilesIn(existsSync(distDir) ? readdirSync(distDir) : null)) rmSync(join(distDir, f), { force: true });
}

/** The script of the sign-in page: sets the flags the app needs to load the account from the server (without ironlog:flag:apiSync it shows an empty, browser-only account), signs in on the stack's own origin, opens /. The page is written by this script so the QA Runner needs no page code (javascript_tool) of its own. */
export function signInScript(flags, email, password) {
  return `const flags = ${JSON.stringify(flags)};
for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v);
fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }) })
  .then(r => { if (r.ok) location.replace('/'); else document.title = 'sign-in failed ' + r.status; })
  .catch(() => { document.title = 'sign-in failed (no answer)'; });
`;
}
export const signInHtml = (scriptName, token) => `<!doctype html><meta charset="utf-8"><title>QA sign-in</title><script src="/${scriptName}?s=${token}"></script>\n`;

/** Writes the sign-in page into the built app (the server serves it; the CSP allows a script file of its own origin, not an inline one). */
function writeSignInPage(distDir, personaId, email, token, password) {
  const { page, script } = signInNames(personaId);
  writeFileSync(join(distDir, script), signInScript(BROWSER_FLAGS, email, password));
  writeFileSync(join(distDir, page), signInHtml(script, token));
  return page;
}

/** The end of `stop`: the sign-in files go first, so a failed drop never leaves the scratch password served; then the drop. Returns why the drop failed, or null. */
export async function finishStop(state, withClient, removeFiles) {
  removeFiles();
  return dropScratch(state, withClient);
}
const SCRATCH_NAME = /^iron_qa_run_[0-9a-f]{8}$/;
const RESERVED_PORTS = new Set([4173, 3103, 3104, 5433]); // other sessions' preview server, the two e2e-qa servers, the shared Postgres

/** Why a base URL may not be opened, or null. Only http on this machine, and no credentials in the address. */
export function urlProblem(raw) {
  let u;
  try { u = new URL(raw); } catch { return `${JSON.stringify(raw)} is not a valid URL`; }
  if (u.protocol !== 'http:') return `${u.protocol} is not allowed: the local stack is plain http`;
  if (u.username || u.password) return 'a URL with a login in it is not allowed';
  if (!LOCAL_HOSTS.includes(u.hostname.toLowerCase())) return `${u.hostname} is not this machine: only 127.0.0.1, localhost or [::1]`;
  if (RESERVED_PORTS.has(Number(u.port))) return `port ${u.port} belongs to another session or service`;
  return null;
}

/** Why the Postgres server may not be used, or null: it must be on this machine, with no host= override that redirects the connection. */
export function serverProblem(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'the database URL is not a valid URL'; }
  for (const key of ['host', 'hostaddr']) if (u.searchParams.has(key)) return `the database URL has a ${key}= parameter, which can send the connection to another machine`;
  if (!LOCAL_HOSTS.includes(u.hostname.toLowerCase()) && u.hostname !== '::1') return `the database is on ${u.hostname}, not this machine`;
  return null;
}

/** Why `name` may not be dropped by stop, or null: it must be a name this script generates AND be the one the state file recorded. */
export function dropProblem(name, state) {
  if (typeof name !== 'string' || !SCRATCH_NAME.test(name)) return `${JSON.stringify(name)} is not a scratch database this script makes (${SCRATCH_PREFIX}<8 hex>)`;
  if (!state || state.db !== name || state.login !== `${name}_app`) return `${name} is not the database and login recorded in the state file: this script did not create it`;
  return null;
}

/** Why `raw` is not the address of the stack this script started (`stateUrl`), or null. Same machine is not enough: another local app is not the stack. */
export function originProblem(raw, stateUrl) {
  const bad = urlProblem(raw);
  if (bad) return bad;
  if (!stateUrl) return 'no stack is running: run start first';
  return new URL(raw).origin === new URL(stateUrl).origin ? null : `${new URL(raw).origin} is not the stack this script started (${new URL(stateUrl).origin})`;
}

/** Whether a process (its command line and working directory) is this checkout's server, so a pid read from an old state file is not killed by mistake. */
export function pidIsStack(cmdline, cwd, root) {
  return typeof cmdline === 'string' && cmdline.includes('server/index.ts') && cwd === root;
}

/** Drops the scratch database and login the state file names; every refusal is a returned reason, nothing is dropped unless all checks pass. `withClient(url, fn)` runs fn on a connection. */
export async function dropScratch(state, withClient) {
  const refused = dropProblem(state.db, state);
  if (refused) return refused;
  const maintenance = new URL(state.base); maintenance.pathname = '/postgres';
  const bad = serverProblem(maintenance.href);
  if (bad) return bad;
  try {
    await withClient(maintenance.href, async c => {
      const { rows } = await c.query(`select shobj_description(oid, 'pg_database') as comment from pg_database where datname = $1`, [state.db]);
      if (rows.length) {
        const m = markProblem(rows[0].comment);
        if (m) throw new Error(m);
        await c.query(`drop database "${state.db}" with (force)`);
      }
      await c.query(`drop role if exists "${state.login}"`);
    });
  } catch (e) { return `could not drop ${state.db}: ${e.message}`; }
  return null;
}

/** Why the mark read from the database does not allow a drop, or null. */
export function markProblem(comment) {
  return comment === SCRATCH_MARK ? null : 'the database does not carry the qa-local mark, so it was not made by this script';
}

export function newScratchName(bytes = randomBytes(4)) { return `${SCRATCH_PREFIX}${Buffer.from(bytes).toString('hex')}`; }

/** A free port on 127.0.0.1 chosen by the OS (never one of the reserved ones). */
export async function freePort() {
  for (let i = 0; i < 20; i++) {
    const port = await new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
    if (!RESERVED_PORTS.has(port)) return port;
  }
  throw new Error('could not find a free port');
}

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stateFile = process.env.QA_LOCAL_STATE_FILE ?? join(tmpdir(), `qa-local-${createHash('sha1').update(root).digest('hex').slice(0, 10)}.json`); // one stack per checkout (the variable is for tests)
const readState = () => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null);
/** The address of the stack this script started for this checkout, or null (no password: the QA Runner's hook reads only this). */
export const readStackUrl = () => { try { const url = readState()?.url; return typeof url === 'string' ? url : null; } catch { return null; } }; // an unreadable state file means no stack: the hook then refuses navigate, and status and stop still run
/** Where the agent saves evidence: the one folder it may write, named the same way the hook names it. */
export const evidenceRoot = () => join(tmpdir(), 'qa-runs');
const fail = (msg, code = 1) => { console.error(`qa-local: ${msg}`); process.exit(code); };

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const pgModule = await import('pg');
  const pg = pgModule.default;
  const withClient = async (url, fn) => { const c = new pg.Client({ connectionString: url }); await c.connect(); try { return await fn(c); } finally { await c.end(); } };
  const given = process.env.QA_LOCAL_PG ?? process.env.DATABASE_URL ?? 'postgres://ironlog:ironlog@127.0.0.1:5433/ironlog';

  if (cmd === 'check-url') {
    const why = originProblem(arg ?? '', readState()?.url);
    if (why) fail(`refused: ${why}`);
    console.log('ok');
    return;
  }

  if (cmd === 'start') {
    const { pickerEnv } = await import('../server/qa/localAdmin.ts');
    if (readState()) fail(`a stack is already running for this checkout (${stateFile}); run stop first`);
    const bad = serverProblem(given);
    if (bad) fail(`refused: ${bad}`, 2);
    const base = new URL(given); base.searchParams.set('sslmode', 'disable');
    const db = newScratchName();
    const login = `${db}_app`;
    const password = randomBytes(12).toString('hex');
    const scratch = new URL(base); scratch.pathname = `/${db}`;
    const appUrl = new URL(scratch); appUrl.username = login; appUrl.password = password;
    const maintenance = new URL(base); maintenance.pathname = '/postgres';
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const out = openSync(join(tmpdir(), `qa-local-${db}.log`), 'a');
    writeFileSync(stateFile, JSON.stringify({ db, login, port, url, pid: null, scratch: scratch.href, app: appUrl.href, base: base.href, log: join(tmpdir(), `qa-local-${db}.log`) }), { mode: 0o600 }); // holds the scratch login's password: owner-only
    try {
      await withClient(maintenance.href, async c => { await c.query(`create database "${db}"`); await c.query(`comment on database "${db}" is '${SCRATCH_MARK}'`); });
      execFileSync('npx', ['dbmate', 'up'], { cwd: root, env: { ...process.env, DATABASE_URL: scratch.href, DBMATE_NO_DUMP_SCHEMA: 'true', DBMATE_MIGRATIONS_DIR: 'db/migrations' }, stdio: ['ignore', 'pipe', 'pipe'] });
      await withClient(scratch.href, c => c.query(`create role "${login}" login password '${password}' in role ironlog_app`));
      if (!process.argv.includes('--no-build') || !existsSync(join(root, 'dist'))) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
      // NODE_ENV=test is for the server only (the least that lets the test-only sign-in start); the build stays a production one.
      const child = spawn('npx', ['tsx', 'server/index.ts'], { cwd: root, detached: true, stdio: ['ignore', out, out], env: {
        ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), BASE_URL: url, STATIC_DIR: 'dist', AUTH_TEST_SIGNIN: 'true',
        BETTER_AUTH_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-secret', GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
        DATABASE_URL: scratch.href, APP_DATABASE_URL: appUrl.href, ...pickerEnv(scratch.href) } });
      child.unref();
      writeFileSync(stateFile, JSON.stringify({ ...readState(), pid: child.pid }), { mode: 0o600 });
      for (let i = 0; i < 90; i++) {
        try { if ((await fetch(`${url}/api/health/db`)).ok) { console.log(JSON.stringify({ url, port, database: db, pid: child.pid, log: readState().log, evidence: evidenceRoot() })); return; } } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error(`the server did not answer on ${url} in 90 s (log: ${readState().log})`);
    } catch (e) {
      console.error(`qa-local: start failed: ${e.stderr?.toString() || e.message}`);
      await stop();
      process.exit(1);
    }
  }

  if (cmd === 'seed') {
    const state = readState();
    if (!state) fail('no stack is running: run start first');
    const why = urlProblem(state.url) ?? serverProblem(state.scratch);
    if (why) fail(`refused: ${why}`, 2);
    const { LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_ID, seedLocalAdmin, TEST_PASSWORD } = await import('../server/qa/localAdmin.ts');
    const { personaAuthId, personaById, personaEmail } = await import('../server/qa/personas.ts');
    const { SEED_EXERCISE_IDS, seedPersona } = await import('../server/qa/seedPersona.ts');
    const { buildPersonaRows } = await import('../server/qa/seedPlan.ts');
    const { localSeedDay } = await import('../server/qa/seedDay.ts');
    const { hashPassword } = await import('better-auth/crypto');
    const admin = arg === LOCAL_ADMIN_ID;
    const persona = admin ? { id: LOCAL_ADMIN_ID } : personaById(arg ?? '');
    if (!persona) fail(`no test account ${JSON.stringify(arg)} in server/qa/personas.ts`, 2);
    const now = new Date();
    const plain = { seal: s => s, sealStable: s => s, open: s => s, isSealed: () => false }; // the scratch server has no PII key
    await withClient(state.scratch, async c => {
      const { rows: [{ comment }] } = await c.query(`select shobj_description(oid, 'pg_database') as comment from pg_database where datname = current_database()`);
      const m = markProblem(comment);
      if (m) throw new Error(m);
      const hash = await hashPassword(TEST_PASSWORD);
      if (admin) await seedLocalAdmin(c, hash);
      else {
        await seedPersona(c, plain, persona, buildPersonaRows(persona, SEED_EXERCISE_IDS, localSeedDay(now)), now);
        await c.query(`insert into auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())
          on conflict (id) do update set password = excluded.password`, [`qa-local-${persona.id}`, personaAuthId(persona.id), hash]);
      }
    });
    const token = seedToken();
    const email = admin ? LOCAL_ADMIN_EMAIL : personaEmail(persona.id);
    const page = writeSignInPage(join(root, 'dist'), persona.id, email, token, TEST_PASSWORD);
    console.log(JSON.stringify({ url: state.url, persona: persona.id, email, signInUrl: `${state.url}/${page}?s=${token}`, signIn: `navigate to signInUrl: the page sets the browser flags, signs in as ${persona.id} and opens /; the tab title says "sign-in failed" if it did not work` }));
    return;
  }

  if (cmd === 'status') { // no passwords: the state file holds the scratch login's
    let st = null; let unreadable = false;
    try { st = readState(); } catch { unreadable = true; }
    console.log(JSON.stringify(st ? { url: st.url, port: st.port, database: st.db, pid: st.pid, log: st.log, evidence: evidenceRoot() } : { running: false, evidence: evidenceRoot(), ...(unreadable ? { unreadableStateFile: stateFile } : {}) }));
    return;
  }
  if (cmd === 'stop') { await stop(); return; }
  fail('usage: qa-local.mjs start [--no-build] | seed <persona-id> | check-url <url> | status | stop', 2);

  async function stop() {
    let state = null;
    try { state = readState(); } catch { fail(`the state file ${stateFile} cannot be read, so nothing is stopped or dropped: look at it, then delete it by hand`); }
    if (!state) { console.error('qa-local: nothing to stop'); return; }
    if (state.pid) {
      // Only a process that is still this checkout's server is killed: after a crash or reboot the pid may belong to something else.
      let cmdline = null; let cwd = null;
      try { cmdline = readFileSync(`/proc/${state.pid}/cmdline`, 'utf8').replaceAll('\0', ' '); cwd = readlinkSync(`/proc/${state.pid}/cwd`); } catch { /* gone, or no /proc */ }
      if (pidIsStack(cmdline, cwd, root)) { try { process.kill(-state.pid, 'SIGTERM'); } catch { /* already gone */ } }
      else if (cmdline !== null) console.error(`qa-local: pid ${state.pid} is not this stack's server any more; not killing it`);
    }
    const why = await finishStop(state, withClient, () => removeSignInFiles(join(root, 'dist')));
    if (why) { console.error(`qa-local: not dropped: ${why}`); process.exitCode = 1; return; }
    rmSync(stateFile, { force: true });
    console.error(`qa-local: stopped; dropped ${state.db} and ${state.login}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
