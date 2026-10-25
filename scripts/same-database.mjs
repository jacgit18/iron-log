#!/usr/bin/env node
// Checks that the production OWNER url and the production READ-ONLY url name the same database server, before anything migrates with the owner
// url. Run by the migrate job (scripts/migrate-run.mjs, brief production-migrate-job) with both URLs from Secret Manager. The read-only login was made on
// production by scripts/db-reader.mjs (and is the parity job's production login), so an owner URL that points anywhere else (staging, QA, a
// typo) is refused before it runs one migration.
//
//   OWNER_URL=... READER_URL=... node scripts/same-database.mjs
//
// Exit 0 when both are set and the same server (pooled and direct addresses count as the same; see sameServer in scripts/lib/db-script.mjs),
// 1 when one is missing or they differ. The URLs are never printed.
import { connectHost, sameServer } from './lib/db-script.mjs';

const owner = process.env.OWNER_URL;
const reader = process.env.READER_URL;
const stop = msg => { console.error(`::error title=Not production's database::${msg}`); process.exit(1); };
if (!owner) stop('OWNER_URL (the production owner login) is not set: nothing was migrated.');
if (!reader) stop('READER_URL (the read-only production login) is not set: cannot confirm which database the owner URL points at, so nothing was migrated.');
const a = connectHost(owner);
const b = connectHost(reader);
if (!a || !b) stop('A database URL could not be read: nothing was migrated.');
if (!(await sameServer(a, b))) stop('The owner URL names a different database server than the read-only production login: nothing was migrated.');
console.log('The owner login and the read-only login name the same production database.');
