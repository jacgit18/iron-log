// npm run catalog:upcs -- [--apply] [--limit N] [--cache file]
// Fills supplement_upcs (the UPC on a bottle mapped to its supplement row; brief supplement-barcode-search, ADR 117) from the NIH label database: reads every on-market label's UPC, one label at a time (about 122,000 calls, 3 at
// once, backing off on a rate limit; hours to a day). Resumable: each label read is kept in the cache file (default .cache/dsld-upcs.tsv, not committed), so a stopped or partly failed run continues where it was.
// Run after catalog:import. Dry run unless --apply is given; it writes as the owner in DATABASE_URL and writes nothing unless every label was read. Run with tsx.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { fetchDsld } from '../server/scripts/catalogImport.ts';
import { crawlUpcs, importUpcs, labelUrl } from '../server/scripts/supplementUpcImport.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, limit: { type: 'string' }, cache: { type: 'string', default: '.cache/dsld-upcs.tsv' } } });
const url = process.env.DATABASE_URL;
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (!url || (limit !== undefined && !(Number.isInteger(limit) && limit > 0))) { console.error('Usage: npm run catalog:upcs -- [--apply] [--limit N] [--cache file]   (DATABASE_URL must be set)'); process.exit(2); }
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, cache: values.cache }));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(JSON.stringify({ msg: m }));
// One request with a timeout; a rate limit or server error waits (Retry-After, else 5, 15, 30, 60 s) and tries again.
const getJson = async (u) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 404) return null;
      if ((r.status === 429 || r.status >= 500) && attempt < 4) { const w = Number(r.headers.get('retry-after')) || [5, 15, 30, 60][attempt]; log(`HTTP ${r.status}, waiting ${w} s`); await sleep(w * 1000); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) { if (attempt >= 4) throw err; await sleep(2000 * (attempt + 1)); }
  }
};

const known = new Map();
if (existsSync(values.cache)) for (const line of readFileSync(values.cache, 'utf8').split('\n')) { const [id, upc] = line.split('\t'); if (id) known.set(id, upc ?? ''); }
mkdirSync(dirname(values.cache), { recursive: true });
log(`${known.size} labels already in the cache`);

const hits = await fetchDsld({ fetchJson: getJson, sleep, log });
const crawl = await crawlUpcs(hits, {
  fetchLabel: async id => { await sleep(150); return getJson(labelUrl(id)); },
  known, limit, log,
  learned: (id, upc) => appendFileSync(values.cache, `${id}\t${upc ?? ''}\n`),
});
console.log(JSON.stringify({ labelsRead: crawl.read, askedThisRun: crawl.asked, withoutUpc: crawl.withoutUpc, upcs: crawl.pairs.size, sharedUpcs: crawl.shared, failed: crawl.failed.length }));
if (crawl.failed.length || limit !== undefined) { console.log(JSON.stringify({ msg: crawl.failed.length ? 'some labels could not be read: nothing written; run again to resume' : '--limit given: a partial crawl, nothing written' })); process.exit(crawl.failed.length ? 1 : 0); }

const db = createDb(url);
try {
  console.log(JSON.stringify(await importUpcs(db, crawl.pairs, { apply: values.apply })));
} catch (err) {
  console.error(JSON.stringify({ msg: 'catalog:upcs failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
