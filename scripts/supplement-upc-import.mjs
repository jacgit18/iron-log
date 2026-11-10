// npm run catalog:upcs -- [--apply] [--limit N] [--cache file] [--since YEAR] [--brand name]... [--all] [--count] [--refresh-hits]
// Fills supplement_upcs (the UPC on a bottle mapped to its supplement row; brief supplement-barcode-search, ADR 117) from the NIH label database, one label at a time, 3 at once, backing off on a rate limit. NIH allows
// roughly 1,000 requests an hour (seen 2026-11-10), so the default reads only labels entered since 2022 plus every label of the priority brands (Thorne, Sports Research and other big sellers; --brand adds more, repeatable);
// --all reads every on-market label (about 122,000: days). --count prints how many labels a run would read and stops. A scoped run adds and changes rows but never removes any; --all also removes UPCs no label carries.
// Resumable: each label read is kept in the cache file (default .cache/dsld-upcs.tsv, not committed), and the downloaded search results in .cache/dsld-upcs.hits.json (reused for 7 days, --refresh-hits downloads again).
// Run after catalog:import. Dry run unless --apply is given; it writes as the owner in DATABASE_URL and writes nothing unless every label was read. Run with tsx.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { fetchDsld } from '../server/scripts/catalogImport.ts';
import { crawlScope, crawlUpcs, importUpcs, labelUrl, PRIORITY_BRANDS, slimHit } from '../server/scripts/supplementUpcImport.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, limit: { type: 'string' }, cache: { type: 'string', default: '.cache/dsld-upcs.tsv' }, since: { type: 'string', default: '2022' }, brand: { type: 'string', multiple: true, default: [] }, all: { type: 'boolean', default: false }, count: { type: 'boolean', default: false }, 'refresh-hits': { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
const limit = values.limit === undefined ? undefined : Number(values.limit);
const since = Number(values.since);
if (!url || (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) || !(Number.isInteger(since) && since >= 1990 && since <= 2100)) { console.error('Usage: npm run catalog:upcs -- [--apply] [--limit N] [--cache file] [--since YEAR] [--brand name]... [--all] [--count] [--refresh-hits]   (DATABASE_URL must be set)'); process.exit(2); }
const scope = values.all ? undefined : { since, brands: [...PRIORITY_BRANDS, ...values.brand.map(b => b.trim().toLowerCase()).filter(Boolean)] };
const target = new URL(url);
console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, cache: values.cache }));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(JSON.stringify({ msg: m }));
// One request with a timeout; a rate limit or server error waits (Retry-After, else 5, 15, 30, 60 s) and tries again.
const getJson = async (u) => {
  for (let attempt = 0, throttled = 0; ; attempt++) {
    try {
      const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (r.status === 404) return null;
      // NIH's hourly limit answers 429 with a long Retry-After: waiting it out is the point, so up to 10 of those do not use up the retries below
      if (r.status === 429 && throttled < 10) { throttled++; attempt--; const w = Number(r.headers.get('retry-after')) || 60; log(`HTTP 429, waiting ${w} s`); await sleep(w * 1000); continue; }
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

// The search results (slimmed to the fields the crawl needs) are kept for a week, so a restart does not spend the hourly allowance on them again.
const hitsFile = values.cache.replace(/\.tsv$/, '') + '.hits.json';
let hits;
if (!values['refresh-hits'] && existsSync(hitsFile) && Date.now() - statSync(hitsFile).mtimeMs < 7 * 86_400_000) {
  try { hits = JSON.parse(readFileSync(hitsFile, 'utf8')); log(`${hits.length} search results from ${hitsFile}`); } catch { log(`${hitsFile} is unreadable: downloading the search results again`); }
}
if (!hits) {
  hits = (await fetchDsld({ fetchJson: getJson, sleep, log })).map(slimHit);
  writeFileSync(hitsFile + '.tmp', JSON.stringify(hits)); renameSync(hitsFile + '.tmp', hitsFile); // whole file or none, so a stopped run never leaves half a list
  log(`${hits.length} search results saved to ${hitsFile}`);
}

const counts = crawlScope(hits, known, scope);
const hours = Math.ceil(counts.toRead / 1000);
console.log(JSON.stringify({ msg: scope ? `scope: labels since ${since} plus ${scope.brands.length} priority brands (--all for everything)` : 'scope: every on-market label', ...counts, estimate: counts.toRead ? `about ${hours} hour${hours === 1 ? '' : 's'} at 1,000 requests an hour (a guess from one run)` : 'nothing left to read' }));
if (values.count) process.exit(0);

const crawl = await crawlUpcs(hits, {
  fetchLabel: async id => { await sleep(150); return getJson(labelUrl(id)); },
  known, limit, scope, log,
  learned: (id, upc) => appendFileSync(values.cache, `${id}\t${upc ?? ''}\n`),
});
console.log(JSON.stringify({ labelsRead: crawl.read, askedThisRun: crawl.asked, withoutUpc: crawl.withoutUpc, inScope: crawl.inScope, upcs: crawl.pairs.size, sharedUpcs: crawl.shared, failed: crawl.failed.length }));
if (crawl.failed.length || limit !== undefined) { console.log(JSON.stringify({ msg: crawl.failed.length ? 'some labels could not be read: nothing written; run again to resume' : '--limit given: a partial crawl, nothing written' })); process.exit(crawl.failed.length ? 1 : 0); }

const db = createDb(url);
try {
  console.log(JSON.stringify(await importUpcs(db, crawl.pairs, { apply: values.apply, prune: !scope })));
} catch (err) {
  console.error(JSON.stringify({ msg: 'catalog:upcs failed', error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
