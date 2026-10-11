// npm run own:exercises -- --admin <email or auth_user_id> [--apply]
// One-off (ADR 024): writes every built-in exercise into the admin's saved exercises, so their Exercise library keeps listing them (each
// marked Yours) once a synced library shows only an account's own exercises. Dry run unless --apply is given; take a backup first. See
// server/scripts/ownExercises.ts. Run with tsx: it imports the app's TypeScript.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { ownExercises } from '../server/scripts/ownExercises.ts';
import { EX } from '../src/lib/data.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({ options: { admin: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
if (!values.admin || !url) {
  console.error('Usage: npm run own:exercises -- --admin <email or auth_user_id> [--apply]   (DATABASE_URL must be set)');
  process.exit(2);
}

// Say which database this is, without the credentials, before anything is written.
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, admin: values.admin }));

const db = createDb(url);
try {
  const result = await ownExercises(db, { admin: values.admin, apply: values.apply, builtins: EX });
  console.log(JSON.stringify({ ...result, written: result.written.length }));
} catch (err) {
  console.error(JSON.stringify({ msg: 'own:exercises failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
