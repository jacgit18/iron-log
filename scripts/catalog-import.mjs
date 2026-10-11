// npm run catalog:import -- --source fedb [--file exercises.json] [--apply] [--allow-mass-retire]
// Fills the catalog (catalog_items) from a free dataset (ADR 028, 030). Dry run unless --apply is given; take a backup first. Writes as
// the owner in DATABASE_URL. --file reads a downloaded copy instead of the pinned URL. See server/scripts/catalogImport.ts.
// Run with tsx: it imports TypeScript. The supplement source (dsld, ADR 029) is not built yet.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { FEDB_LICENSE, FEDB_URL, importCatalog, mapFedb } from '../server/scripts/catalogImport.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({
  options: { source: { type: 'string' }, file: { type: 'string' }, apply: { type: 'boolean', default: false }, 'allow-mass-retire': { type: 'boolean', default: false } },
});
const url = process.env.DATABASE_URL;
if (values.source !== 'fedb' || !url) {
  console.error('Usage: npm run catalog:import -- --source fedb [--file exercises.json] [--apply] [--allow-mass-retire]   (DATABASE_URL must be set; dsld is not built yet)');
  process.exit(2);
}

const target = new URL(url);
const from = values.file ?? FEDB_URL;
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, source: values.source, from }));

const load = async () => {
  if (values.file) return JSON.parse(readFileSync(values.file, 'utf8'));
  const res = await fetch(FEDB_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  return res.json();
};

const db = createDb(url);
try {
  const { rows, unmapped, skipped } = mapFedb(await load());
  const kinds = rows.reduce((n, r) => ({ ...n, [r.kind]: (n[r.kind] ?? 0) + 1 }), {});
  const result = await importCatalog(db, { source: 'fedb', license: FEDB_LICENSE, rows, apply: values.apply, allowMassRetire: values['allow-mass-retire'] });
  console.log(JSON.stringify({
    applied: result.applied, rows: rows.length, kinds,
    added: result.added.length, changed: result.changed.length, retired: result.retired.length, unchanged: result.unchanged,
    unmapped, skipped,
  }));
  if (result.retired.length) console.log(JSON.stringify({ retired: result.retired }));
} catch (err) {
  console.error(JSON.stringify({ msg: 'catalog:import failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
