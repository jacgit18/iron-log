// npm run delete:user -- <email> [--yes] [--allow-production] [--billing-cancelled]      (DATABASE_URL and PII_ENCRYPTION_KEY from the environment or .env)
// Deletes one person's account on request (production-access rule; runbook ops/delete-user-on-request.md), the same deletion as Settings >
// Delete my account (migration 010's delete_my_account(), through server/commands/account.ts). A DRY RUN unless --yes: it prints the account's
// plan, admin flag, dates and row counts per table (never the address, a name or any content) and changes nothing. With --yes it asks for the
// address to be typed again, then deletes. A database that is not on this machine needs --allow-production as well. For production use
// `npm run prod:db -- delete-user <email> [--apply]`, which takes the key from Secret Manager and backs up first. Run with tsx.
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createPiiCrypto, parsePiiKey } from '../server/auth/piiCrypto.ts';
import { createDb } from '../server/db/connection.ts';
import { blockedReason, confirmMatches, databaseProblem, deleteUser, parseDeleteUserArgs, planDeletion } from '../server/scripts/deleteUser.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const USAGE = 'Usage: npm run delete:user -- <email> [--yes] [--allow-production] [--billing-cancelled]   (DATABASE_URL and PII_ENCRYPTION_KEY must be set)';
const args = parseDeleteUserArgs(process.argv.slice(2));
const url = process.env.DATABASE_URL;
const key = parsePiiKey(process.env.PII_ENCRYPTION_KEY);
if ('error' in args || !url || 'error' in key) {
  console.error(`${'error' in args ? `${args.error}. ` : ''}${'error' in key ? `PII_ENCRYPTION_KEY: ${key.error}. ` : ''}${USAGE}`);
  process.exit(2);
}
const problem = databaseProblem(url, args.allowProduction);
if (problem) {
  console.error(`Refusing: ${problem}.`);
  process.exit(2);
}

const target = new URL(url);
console.log(JSON.stringify({ msg: args.yes ? 'deleting one account' : 'dry run (add --yes to delete)', database: `${target.hostname}${target.pathname}` }));
const db = createDb(url);
try {
  const crypto = createPiiCrypto(key.key);
  const plan = await planDeletion(db, crypto, args.email);
  if ('error' in plan) {
    console.log(plan.error);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ account: plan.user, hasStripeCustomer: plan.hasStripeCustomer, wouldDelete: plan.rows, alsoDeleted: 'the sign-in record, sessions, Google tokens and emailed codes' }, null, 2));
    const blocked = blockedReason(plan, args.billingCancelled);
    if (blocked) {
      console.error(`Cannot delete: ${blocked}.`);
      process.exitCode = 1;
    } else if (!args.yes) {
      console.log('Dry run: nothing was deleted. Add --yes to delete this account.');
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const typed = await rl.question('Type the email address again to delete this account for good: ');
      rl.close();
      if (!confirmMatches(typed, args.email)) {
        console.error('That is not the same address. Nothing was deleted.');
        process.exitCode = 1;
      } else {
        await deleteUser(db, crypto, plan, args.email);
        console.log(JSON.stringify({ msg: 'account deleted', id: plan.user.id }));
      }
    }
  }
} catch (err) {
  console.error(JSON.stringify({ msg: 'delete failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
