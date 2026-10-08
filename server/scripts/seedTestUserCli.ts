import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../db/connection.ts';
import { seedTestUser } from './seedTestUser.ts';

// npm run seed:test-user -- --from <owner auth_user_id> --to <test auth_user_id> [--apply]
// Dry run unless --apply is given. See seedTestUser.ts for what is copied.
if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
if (!values.from || !values.to || !url) {
  console.error('Usage: npm run seed:test-user -- --from <auth_user_id> --to <auth_user_id> [--apply]   (DATABASE_URL must be set)');
  process.exit(2);
}

// Say which database this is, without the credentials, before anything is written.
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'seeding' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, from: values.from, to: values.to }));

const db = createDb(url);
try {
  console.log(JSON.stringify(await seedTestUser(db, { from: values.from, to: values.to, apply: values.apply })));
} catch (err) {
  console.error(JSON.stringify({ msg: 'seeding failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
