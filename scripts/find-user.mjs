// npm run find:user -- <email>      (DATABASE_URL and PII_ENCRYPTION_KEY from the environment or .env)
// Read-only (production-access rule): finds the app account behind one email address and prints its id, plan, admin flag and dates, never
// the address or name. Names and emails are sealed (ADR 046), so the address is sealed with the same key and matched. For production use
// `npm run prod:db -- find-user <email>`, which takes the key from Secret Manager into this one command. Run with tsx.
import { existsSync } from 'node:fs';
import { createPiiCrypto, parsePiiKey } from '../server/auth/piiCrypto.ts';
import { createDb } from '../server/db/connection.ts';
import { findUser } from '../server/scripts/findUser.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const email = process.argv[2];
const url = process.env.DATABASE_URL;
const key = parsePiiKey(process.env.PII_ENCRYPTION_KEY);
if (!email || !url || 'error' in key) {
  console.error(`Usage: npm run find:user -- <email>   (DATABASE_URL and PII_ENCRYPTION_KEY must be set${'error' in key ? `: ${key.error}` : ''})`);
  process.exit(2);
}

const target = new URL(url);
console.log(JSON.stringify({ msg: 'looking up one account (read-only)', database: `${target.hostname}${target.pathname}` }));
const db = createDb(url);
try {
  const found = await findUser(db, createPiiCrypto(key.key), email);
  console.log(found.length ? JSON.stringify(found, null, 2) : 'No account with that address.');
} catch (err) {
  console.error(JSON.stringify({ msg: 'lookup failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
