import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { authConfigFrom, createAuth } from './auth/betterAuth.ts';
import { minVersionFrom } from './clientVersion.ts';
import { createDb } from './db/connection.ts';
import { checkDbRole } from './db/role.ts';

// Local development reads .env; in production the platform sets the variables and there is no file.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT) || 3001;
// The API connects as the restricted role (APP_DATABASE_URL, migration 009). DATABASE_URL is the owner that runs migrations and is only a
// fallback for local development, where the database role is a superuser.
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
const db = databaseUrl ? createDb(databaseUrl) : undefined;
if (!db) console.warn(JSON.stringify({ msg: 'DATABASE_URL is not set; /api/health/db will answer 503' }));
// Row-level security protects nothing if the API connects as a superuser or as the table owner: say so, and refuse in production.
if (db) {
  const problem = await checkDbRole(db, process.env.NODE_ENV);
  if (problem) console.warn(JSON.stringify({ msg: 'row-level security is not protecting this connection', problem }));
}

// The built PWA, served from the same origin as the API. Absent in development, where Vite serves it.
const staticDir = process.env.STATIC_DIR ?? 'dist';

// The oldest app build that may sync. Unset means no gate. A value that is not a number stops the server from starting.
const minClientVersion = minVersionFrom(process.env.MIN_CLIENT_VERSION);

// Sign-in (ADR 004). Off, with the reasons logged, unless everything it needs is set; the API then answers 401 to everyone
// except where the development sign-in is allowed.
const setup = authConfigFrom({ ...process.env, DATABASE_URL: databaseUrl });
const auth = setup.enabled ? createAuth(setup.config) : undefined;
console.log(JSON.stringify(setup.enabled
  ? { msg: 'sign-in is on', baseURL: setup.config.baseURL, testSignIn: setup.config.testSignIn === true }
  : { msg: 'sign-in is off', reasons: setup.reasons }));

// Outside development and test the development sign-in is refused, so without sign-in nobody can use the API at all. Say so loudly.
if (!auth && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  console.error(JSON.stringify({ msg: 'NOBODY CAN SIGN IN: sign-in is off and the development sign-in is not allowed here', reasons: setup.enabled ? [] : setup.reasons }));
}

// Cloud Run puts one proxy in front of the container (it sets K_SERVICE). TRUST_PROXY overrides: a number of proxies, or false.
const trustProxy = process.env.TRUST_PROXY !== undefined ? (process.env.TRUST_PROXY === 'false' ? false : Number(process.env.TRUST_PROXY)) : process.env.K_SERVICE ? 1 : undefined;
if (typeof trustProxy === 'number' && !Number.isInteger(trustProxy)) throw new Error('TRUST_PROXY must be a whole number of proxies, or false');

const server = createApp({ db, staticDir, minClientVersion, auth, allowedOrigins: setup.enabled ? [setup.config.baseURL] : [], trustProxy }).listen(port, () => {
  console.log(JSON.stringify({ msg: 'listening', port }));
});

// Cloud Run sends SIGTERM before stopping an instance: stop accepting requests, then close the pool.
process.on('SIGTERM', () => {
  server.close(() => { void db?.destroy(); void auth?.pool.end(); });
});
