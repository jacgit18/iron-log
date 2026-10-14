#!/usr/bin/env node
// Makes (or re-keys) the read-only login the CI deploy uses to ask production which migrations it has (scripts/db-pending.mjs).
// Run through `scripts/prod-db.sh reader --apply`, which pipes the result straight into a GitHub secret, so it is never shown.
//
//   DATABASE_URL=<owner url> node scripts/db-reader.mjs
//
// The role can log in and read dbmate's schema_migrations table, nothing else: no user data (the app's tables are granted to
// ironlog_app only, and RLS stays on), no writes (every transaction is read-only), one connection, short timeouts. Running it again
// gives the role a new password, which is how to rotate it. Prints the role's connection URL on stdout and nothing else.
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const ROLE = 'migrations_reader';
const owner = process.env.DATABASE_URL;
if (!owner) { console.error('No DATABASE_URL (the owner URL).'); process.exit(2); }

const password = randomBytes(24).toString('base64url');
const client = new pg.Client({ connectionString: owner, connectionTimeoutMillis: 15_000 });
try {
  await client.connect();
  const db = (await client.query('select current_database() as d')).rows[0].d;
  const exists = (await client.query('select 1 from pg_roles where rolname = $1', [ROLE])).rowCount > 0;
  // A password cannot be a bind parameter in CREATE/ALTER ROLE; it is base64url, so quoting it is safe.
  const pw = client.escapeLiteral(password);
  await client.query('begin');
  // A new role has no superuser, createdb or createrole by default; those are not named here because only a superuser may name
  // the superuser attribute at all, and Neon's owner is not one.
  await client.query(`${exists ? 'alter' : 'create'} role ${ROLE} with login noinherit connection limit 1 password ${pw}`);
  await client.query(`alter role ${ROLE} set default_transaction_read_only = on`);
  await client.query(`alter role ${ROLE} set statement_timeout = '15s'`);
  await client.query(`grant connect on database ${client.escapeIdentifier(db)} to ${ROLE}`);
  await client.query(`grant usage on schema public to ${ROLE}`);
  await client.query(`grant select on public.schema_migrations to ${ROLE}`);
  await client.query('commit');
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error(`Could not make the ${ROLE} role: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

// The same host, database and options as the owner URL, with this role's name and password.
const u = new URL(owner);
u.username = ROLE; u.password = password;
process.stdout.write(u.toString());
