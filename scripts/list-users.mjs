// npm run list:users [-- --reveal]      (DATABASE_URL and PII_ENCRYPTION_KEY from the environment or .env)
// Read-only (production-access rule): lists every app account with its id, plan, admin flag and created date. Names and emails stay sealed
// unless --reveal is given. For production use `npm run prod:db -- list-users [--reveal]`, which takes the key from Secret Manager into this
// one command. Run with tsx.
import { existsSync } from 'node:fs';
import { createPiiCrypto, parsePiiKey } from '../server/auth/piiCrypto.ts';
import { createDb } from '../server/db/connection.ts';
import { listUsers } from '../server/scripts/listUsers.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const reveal = process.argv.includes('--reveal');
const url = process.env.DATABASE_URL;
const key = parsePiiKey(process.env.PII_ENCRYPTION_KEY);
if (!url || (reveal && 'error' in key)) {
  console.error(`Usage: npm run list:users [-- --reveal]   (DATABASE_URL must be set${reveal && 'error' in key ? `; PII_ENCRYPTION_KEY: ${key.error}` : ''})`);
  process.exit(2);
}

const target = new URL(url);
console.log(JSON.stringify({ msg: 'listing accounts (read-only)', database: `${target.hostname}${target.pathname}`, reveal }));
const db = createDb(url);
try {
  // Without --reveal nothing is opened, so a placeholder key is enough to build the helper.
  const crypto = createPiiCrypto('key' in key ? key.key : Buffer.alloc(32));
  const users = await listUsers(db, crypto, reveal);
  console.log(users.length ? JSON.stringify(users, null, 2) : 'No accounts.');
  console.log(`${users.length} account${users.length === 1 ? '' : 's'}`);
} catch (err) {
  console.error(JSON.stringify({ msg: 'list failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
