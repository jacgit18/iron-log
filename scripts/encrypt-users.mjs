// npm run encrypt:users [-- --apply]
// One-off (ADR 046): seals the names, emails and photo addresses already in Better Auth's tables, using PII_ENCRYPTION_KEY from .env.
// Dry run unless --apply is given; take a backup first (and keep the key somewhere outside the database: without it the data is gone).
// Run it AFTER the code that reads sealed values is deployed with the key set, then set PII_PLAINTEXT_DONE=true. Safe to run again.
// Run with tsx: it imports the app's TypeScript.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPiiCrypto, parsePiiKey } from '../server/auth/piiCrypto.ts';
import { createDb } from '../server/db/connection.ts';
import { encryptUsers } from '../server/scripts/encryptUsers.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
const key = parsePiiKey(process.env.PII_ENCRYPTION_KEY);
if (!url || 'error' in key) {
  console.error(`Usage: npm run encrypt:users [-- --apply]   (DATABASE_URL and PII_ENCRYPTION_KEY must be set${'error' in key ? `: ${key.error}` : ''})`);
  process.exit(2);
}

// Say which database this is, without the credentials, before anything is written.
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'sealing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}` }));

const db = createDb(url);
try {
  console.log(JSON.stringify(await encryptUsers(db, createPiiCrypto(key.key), values.apply)));
} catch (err) {
  console.error(JSON.stringify({ msg: 'encrypt failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
