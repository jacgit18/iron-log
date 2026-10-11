// npm run catalog:import -- --source fedb|dsld [--file exercises.json] [--apply] [--allow-mass-retire]
// Fills the catalog (catalog_items) from a free dataset (ADR 028, 029, 030): fedb = free-exercise-db (exercises, stretches), dsld = the NIH
// supplement label database (about 120,000 products; a few minutes and a few hundred MB of download). Dry run unless --apply is given; take a backup first. Writes as
// the owner in DATABASE_URL. --file reads a downloaded copy instead of the pinned URL. See server/scripts/catalogImport.ts.
// Run with tsx: it imports TypeScript. --file is for fedb only.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { DSLD_API, DSLD_LICENSE, FEDB_LICENSE, FEDB_URL, fetchDsld, importCatalog, mapDsld, mapFedb } from '../server/scripts/catalogImport.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({
  options: { source: { type: 'string' }, file: { type: 'string' }, apply: { type: 'boolean', default: false }, 'allow-mass-retire': { type: 'boolean', default: false } },
});
const url = process.env.DATABASE_URL;
if (!['fedb', 'dsld'].includes(values.source) || !url || (values.file && values.source !== 'fedb')) {
  console.error('Usage: npm run catalog:import -- --source fedb|dsld [--file exercises.json (fedb only)] [--apply] [--allow-mass-retire]   (DATABASE_URL must be set)');
  process.exit(2);
}

const target = new URL(url);
const from = values.source === 'dsld' ? DSLD_API : values.file ?? FEDB_URL;
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, source: values.source, from }));

const loadFedb = async () => {
  if (values.file) return JSON.parse(readFileSync(values.file, 'utf8'));
  const res = await fetch(FEDB_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  return res.json();
};
// DSLD: one request at a time, a minute each at most, three tries with a growing pause before giving up.
const fetchJson = async url => {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`DSLD request failed after 3 tries (${url}): ${err instanceof Error ? err.message : err}`);
      await new Promise(done => setTimeout(done, 2000 * attempt));
    }
  }
};
const load = async () => values.source === 'dsld'
  ? mapDsld(await fetchDsld({ fetchJson, sleep: ms => new Promise(done => setTimeout(done, ms)), log: msg => console.log(JSON.stringify({ msg })) }))
  : mapFedb(await loadFedb());

const db = createDb(url);
try {
  const { rows, unmapped, skipped } = await load();
  const kinds = rows.reduce((n, r) => ({ ...n, [r.kind]: (n[r.kind] ?? 0) + 1 }), {});
  const result = await importCatalog(db, { source: values.source, license: values.source === 'dsld' ? DSLD_LICENSE : FEDB_LICENSE, rows, apply: values.apply, allowMassRetire: values['allow-mass-retire'] });
  console.log(JSON.stringify({
    applied: result.applied, rows: rows.length, kinds,
    added: result.added.length, changed: result.changed.length, retired: result.retired.length, unchanged: result.unchanged,
    unmapped, skipped,
  }));
  // The first 50 retired ids, so a supplement import that retires thousands stays readable.
  if (result.retired.length) console.log(JSON.stringify({ retired: result.retired.slice(0, 50), ...(result.retired.length > 50 ? { andMore: result.retired.length - 50 } : {}) }));
} catch (err) {
  console.error(JSON.stringify({ msg: 'catalog:import failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
