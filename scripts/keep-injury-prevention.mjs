// npm run keep:injury-prevention -- [--apply]
// One-off (2026-10-14): Injury prevention becomes off by default. Run this after a backup and before deploying that change: every account
// that never chose gets `injuryPrevention: true`, so existing accounts keep it on and only new accounts start with it off. Dry run unless
// --apply is given. See server/scripts/keepInjuryPrevention.ts. Run with tsx: it imports the app's TypeScript.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { keepInjuryPrevention } from '../server/scripts/keepInjuryPrevention.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Usage: npm run keep:injury-prevention -- [--apply]   (DATABASE_URL must be set)');
  process.exit(2);
}

// Say which database this is, without the credentials, before anything is written.
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}` }));

const db = createDb(url);
try {
  console.log(JSON.stringify(await keepInjuryPrevention(db, { apply: values.apply })));
} catch (err) {
  console.error(JSON.stringify({ msg: 'keep:injury-prevention failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
