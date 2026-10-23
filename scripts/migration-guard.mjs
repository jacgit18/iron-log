#!/usr/bin/env node
// Refuses to auto-apply a destructive migration (brief production-migrates-in-deploy, owner decision 2026-10-23). Reads the `-- migrate:up` part
// of each file given and exits 1, naming the file and the statement, when it would drop a table, column or schema, truncate,
// rename, change a column's type or delete rows. Adding tables, columns, indexes, functions, policies and grants is fine, and so is
// `create or replace function`, and replacing a check constraint (drop constraint, then add constraint, which widens or keeps what is allowed and loses no data): dollar-quoted bodies (function and trigger bodies) are not scanned because they do not run when the
// migration does; a `do $$ ... $$` block does run, so its body is scanned.
//
//   node scripts/migration-guard.mjs db/migrations/20261101000001_x.sql ...
//
// Exit 0 when every file is safe to apply automatically; 1 when one is not (the deploy then stops and says to apply it by hand:
// scripts/prod-db.sh migrate --apply); 2 on a usage error or an unreadable file. No database is touched.
import { readFileSync } from 'node:fs';

/** The up part of a dbmate migration: from `-- migrate:up` to `-- migrate:down` (or the end). */
export const upPart = text => {
  const up = text.search(/^--\s*migrate:up\b/m);
  const start = up < 0 ? 0 : text.indexOf('\n', up) + 1;
  const down = text.slice(start).search(/^--\s*migrate:down\b/m);
  return down < 0 ? text.slice(start) : text.slice(start, start + down);
};

/** SQL without comments, string literals and the bodies of functions (dollar-quoted text that is not a `do` block). */
export const runnableSql = sql => {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  // Dollar-quoted blocks: keep a `do $$ ... $$` body (it runs now), drop every other one (function bodies).
  s = s.replace(/(\bdo\s+)?(\$[A-Za-z_]*\$)([\s\S]*?)\2/gi, (_m, isDo, _tag, body) => (isDo ? ` ${body} ` : ' '));
  return s.replace(/'(?:[^']|'')*'/g, "''"); // string literals can hold any word
};

const RULES = [
  [/\bdrop\s+table\b/i, 'drops a table'],
  [/\bdrop\s+column\b/i, 'drops a column'],
  [/\bdrop\s+schema\b/i, 'drops a schema'],
  [/\bdrop\s+database\b/i, 'drops a database'],
  [/\btruncate\b/i, 'truncates a table'],
  [/\brename\b/i, 'renames something'],
  [/\balter\s+column\s+\S+\s+(?:set\s+data\s+)?type\b/i, 'changes a column type'],
  [/\bdelete\s+from\b/i, 'deletes rows'],
];

/** The reasons a migration's up part is destructive: [] when it is safe to apply automatically. */
export const destructiveReasons = text => {
  const sql = runnableSql(upPart(text));
  return RULES.filter(([re]) => re.test(sql)).map(([, why]) => why);
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node scripts/migration-guard.mjs <migration file>...'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch (e) { console.error(`Cannot read ${f}: ${e instanceof Error ? e.message : String(e)}`); process.exit(2); }
    const why = destructiveReasons(text);
    if (why.length) { bad = 1; console.log(`${f}: ${why.join(', ')}`); }
  }
  process.exit(bad);
}
