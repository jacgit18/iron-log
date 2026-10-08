import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';

// Local development reads .env; in production the platform sets the variables and there is no file.
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT) || 3001;
const db = process.env.DATABASE_URL ? createDb(process.env.DATABASE_URL) : undefined;
if (!db) console.warn(JSON.stringify({ msg: 'DATABASE_URL is not set; /api/health/db will answer 503' }));

// The built PWA, served from the same origin as the API. Absent in development, where Vite serves it.
const staticDir = process.env.STATIC_DIR ?? 'dist';

const server = createApp({ db, staticDir }).listen(port, () => {
  console.log(JSON.stringify({ msg: 'listening', port }));
});

// Cloud Run sends SIGTERM before stopping an instance: stop accepting requests, then close the pool.
process.on('SIGTERM', () => {
  server.close(() => void db?.destroy());
});
