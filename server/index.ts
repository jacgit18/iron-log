import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { authConfigFrom, createAuth } from './auth/betterAuth.ts';
import { minVersionFrom } from './clientVersion.ts';
import { createDb } from './db/connection.ts';

// Local development reads .env; in production the platform sets the variables and there is no file.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT) || 3001;
const db = process.env.DATABASE_URL ? createDb(process.env.DATABASE_URL) : undefined;
if (!db) console.warn(JSON.stringify({ msg: 'DATABASE_URL is not set; /api/health/db will answer 503' }));

// The built PWA, served from the same origin as the API. Absent in development, where Vite serves it.
const staticDir = process.env.STATIC_DIR ?? 'dist';

// The oldest app build that may sync. Unset means no gate. A value that is not a number stops the server from starting.
const minClientVersion = minVersionFrom(process.env.MIN_CLIENT_VERSION);

// Sign-in (ADR 004). Off, with the reasons logged, unless everything it needs is set; the API then answers 401 to everyone
// except where the development sign-in is allowed.
const setup = authConfigFrom(process.env);
const auth = setup.enabled ? createAuth(setup.config) : undefined;
console.log(JSON.stringify(setup.enabled
  ? { msg: 'sign-in is on', baseURL: setup.config.baseURL, testSignIn: setup.config.testSignIn === true }
  : { msg: 'sign-in is off', reasons: setup.reasons }));

// Outside development and test the development sign-in is refused, so without sign-in nobody can use the API at all. Say so loudly.
if (!auth && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  console.error(JSON.stringify({ msg: 'NOBODY CAN SIGN IN: sign-in is off and the development sign-in is not allowed here', reasons: setup.enabled ? [] : setup.reasons }));
}

const server = createApp({ db, staticDir, minClientVersion, auth }).listen(port, () => {
  console.log(JSON.stringify({ msg: 'listening', port }));
});

// Cloud Run sends SIGTERM before stopping an instance: stop accepting requests, then close the pool.
process.on('SIGTERM', () => {
  server.close(() => { void db?.destroy(); void auth?.pool.end(); });
});
