// npm run reset:accounts -- --admin <email or auth_user_id> [--apply]
// One-off (ADR 021): keeps the admin's data, writing down the built-in plan and default stretches they were shown as real rows, and
// clears every other account's programs and libraries. Dry run unless --apply is given; take a backup first. See
// server/scripts/resetAccounts.ts for exactly what is kept and deleted. Run with tsx: it imports the app's TypeScript.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { resetAccounts } from '../server/scripts/resetAccounts.ts';
import { BUILTIN } from '../src/lib/data.ts';
import { DEFAULT_STRETCHES } from '../src/lib/stretches.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({ options: { admin: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
if (!values.admin || !url) {
  console.error('Usage: npm run reset:accounts -- --admin <email or auth_user_id> [--apply]   (DATABASE_URL must be set)');
  process.exit(2);
}

// Say which database this is, without the credentials, before anything is written.
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'resetting' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, admin: values.admin }));

const db = createDb(url);
try {
  const result = await resetAccounts(db, { admin: values.admin, apply: values.apply, defaults: { programs: BUILTIN, stretches: DEFAULT_STRETCHES } });
  console.log(JSON.stringify(result));
} catch (err) {
  console.error(JSON.stringify({ msg: 'reset failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
