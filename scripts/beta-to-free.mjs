// npm run beta:to-free -- [--apply]
// One-off (billing go-live): every account on the beta plan moves to free so it can subscribe. Run this after a backup and after the
// default-free migration. Dry run unless --apply is given; prints ids and counts, never an email or a name. See server/scripts/betaToFree.ts.
// Run with tsx: it imports the app's TypeScript.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { betaToFree } from '../server/scripts/betaToFree.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Usage: npm run beta:to-free -- [--apply]   (DATABASE_URL must be set)');
  process.exit(2);
}

// Say which database this is, without the credentials, before anything is written.
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}` }));

const db = createDb(url);
try {
  console.log(JSON.stringify(await betaToFree(db, { apply: values.apply })));
} catch (err) {
  console.error(JSON.stringify({ msg: 'beta:to-free failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
