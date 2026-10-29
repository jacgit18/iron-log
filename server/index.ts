import { existsSync } from 'node:fs';
import { adminsFrom } from './admin.ts';
import { createApp } from './app.ts';
import { authConfigFrom, createAuth } from './auth/betterAuth.ts';
import { piiBootCheck } from './auth/piiBootCheck.ts';
import { billingConfigFrom, stripeApi } from './billing.ts';
import { minVersionFrom } from './clientVersion.ts';
import { createDb } from './db/connection.ts';
import { remoteDatabaseProblem } from './db/localOnly.ts';
import { checkDbRole } from './db/role.ts';
import { installProcessGuards } from './processGuards.ts';
import { cloudTasksScheduler, oidcVerifier, tasksConfigFrom } from './push/cloudTasks.ts';
import { pushConfigFrom } from './push/config.ts';
import { webPushSender } from './push/send.ts';
import { usageKeyFrom } from './usage.ts';

// Local development reads .env; in production the platform sets the variables and there is no file.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT) || 3001;
// The API connects as the restricted role (APP_DATABASE_URL, migration 009). DATABASE_URL is the owner that runs migrations and is only a
// fallback for local development, where the database role is a superuser.
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const remote = remoteDatabaseProblem(databaseUrl, process.env.NODE_ENV, process.env.ALLOW_REMOTE_DATABASE);
if (remote) {
  console.error(JSON.stringify({ msg: `Refusing to start: ${remote}` }));
  process.exit(1);
}
const db = databaseUrl ? createDb(databaseUrl) : undefined;
if (!db) console.warn(JSON.stringify({ msg: 'DATABASE_URL is not set; /api/health/db will answer 503' }));
// Row-level security protects nothing if the API connects as a superuser or as the table owner: say so, and refuse in production.
if (db) {
  const problem = await checkDbRole(db, process.env.NODE_ENV);
  if (problem) console.warn(JSON.stringify({ msg: 'row-level security is not protecting this connection', problem }));
}

// The database key (ADR 046): in production a missing or wrong PII_ENCRYPTION_KEY stops the server here, with the reason, instead of
// storing names and emails in the clear or failing every signed-in request. A revision that stops fails its smoke check and gets no traffic.
const pii = await piiBootCheck(process.env, db);
if (pii.problem) {
  console.error(JSON.stringify({ msg: `Refusing to start: ${pii.problem}` }));
  process.exit(1);
}
console.log(JSON.stringify({ msg: 'database key checked', result: pii.note }));

// The built PWA, served from the same origin as the API. Absent in development, where Vite serves it.
const staticDir = process.env.STATIC_DIR ?? 'dist';

// The oldest app build that may sync. Unset means no gate. A value that is not a number stops the server from starting.
const minClientVersion = minVersionFrom(process.env.MIN_CLIENT_VERSION);

// Sign-in (ADR 004). Off, with the reasons logged, unless everything it needs is set; the API then answers 401 to everyone
// except where the development sign-in is allowed.
const setup = authConfigFrom({ ...process.env, DATABASE_URL: databaseUrl });
const auth = setup.enabled ? createAuth(setup.config) : undefined;
console.log(JSON.stringify(setup.enabled
  ? { msg: 'sign-in is on', baseURL: setup.config.baseURL, testSignIn: setup.config.testSignIn === true, emailCode: setup.config.sendCode !== undefined }
  : { msg: 'sign-in is off', reasons: setup.reasons }));

// Web Push (ADR 044): the keys are set and valid, and Cloud Tasks (a queue, an invoker account, BASE_URL) is set too. Each part says why it is off.
const pushSetup = pushConfigFrom(process.env);
const tasksSetup = tasksConfigFrom(process.env);
console.log(JSON.stringify(pushSetup.config ? { msg: 'push keys are set' } : { msg: 'push is off', reason: pushSetup.reason }));
console.log(JSON.stringify(tasksSetup.config ? { msg: 'push scheduling is on', queue: tasksSetup.config.queue } : { msg: 'push scheduling is off', reason: tasksSetup.reason }));
const push = pushSetup.config && tasksSetup.config
  ? { publicKey: pushSetup.config.publicKey, scheduler: cloudTasksScheduler(tasksSetup.config), fire: { verify: oidcVerifier(tasksSetup.config), send: webPushSender(pushSetup.config) } }
  : { publicKey: pushSetup.config?.publicKey };

// Stripe billing (ADR 065): off unless every setting is present; a live key also needs BILLING_LIVE=1. The return address is this app's own.
const billingSetup = billingConfigFrom(process.env, setup.enabled ? setup.config.baseURL : undefined);
console.log(JSON.stringify(billingSetup.config ? { msg: 'billing is on' } : { msg: 'billing is off', reason: billingSetup.problem ?? 'not configured' }));
const billing = billingSetup.config ? { api: stripeApi(billingSetup.config), config: billingSetup.config } : undefined;

// Outside development and test the development sign-in is refused, so without sign-in nobody can use the API at all. Say so loudly.
if (!auth && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  console.error(JSON.stringify({ msg: 'NOBODY CAN SIGN IN: sign-in is off and the development sign-in is not allowed here', reasons: setup.enabled ? [] : setup.reasons }));
}

// Cloud Run puts one proxy in front of the container (it sets K_SERVICE). TRUST_PROXY overrides: a number of proxies, or false.
const trustProxy = process.env.TRUST_PROXY !== undefined ? (process.env.TRUST_PROXY === 'false' ? false : Number(process.env.TRUST_PROXY)) : process.env.K_SERVICE ? 1 : undefined;
if (typeof trustProxy === 'number' && !Number.isInteger(trustProxy)) throw new Error('TRUST_PROXY must be a whole number of proxies, or false');

const server = createApp({ db, staticDir, minClientVersion, auth, admins: adminsFrom(process.env.ADMIN_EMAILS), allowedOrigins: setup.enabled ? [setup.config.baseURL] : [], canonicalOrigin: setup.enabled ? setup.config.baseURL : undefined, trustProxy, push, billing, usageKey: usageKeyFrom(process.env.BETTER_AUTH_SECRET) }).listen(port, () => {
  console.log(JSON.stringify({ msg: 'listening', port }));
});

// An escaped error or Cloud Run's SIGTERM: stop accepting requests, close the pools, exit (with a hard stop if that hangs).
installProcessGuards(server, { close: async () => { await Promise.all([db?.destroy(), auth?.pool.end()]); } });
