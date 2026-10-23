// npm run grocery:shares -- <user id>      (DATABASE_URL from the environment or .env)
// Read-only (production-access rule): prints counts and shapes of one account's grocery splits (how many items and month lines have each kind of
// share), never a name, id or amount. For production use `npm run prod:db -- grocery-shares <user id>` (the id comes from `find-user`). Run with tsx.
import { existsSync } from 'node:fs';
import { createDb } from '../server/db/connection.ts';
import { readShares } from '../server/scripts/groceryShares.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const userId = process.argv[2];
const url = process.env.DATABASE_URL;
if (!userId || !/^\d+$/.test(userId) || !url) {
  console.error('Usage: npm run grocery:shares -- <user id>   (a number; DATABASE_URL must be set)');
  process.exit(2);
}
const target = new URL(url);
console.log(JSON.stringify({ msg: 'reading grocery splits for one account (read-only)', database: `${target.hostname}${target.pathname}` }));
const db = createDb(url);
try {
  console.log(JSON.stringify(await readShares(db, userId), null, 2));
} catch (err) {
  console.error(JSON.stringify({ msg: 'read failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
