// npm run catalog:nutrition -- [--full] [--results=<file>] [--cache=<file>] [--file=<recipes_parsed.json>] [--ceiling=50] [--price-in=0.10] [--price-out=0.50] [--model=<id>]
// npm run catalog:nutrition -- --load=<results file> [--apply]
// Library recipe nutrition (brief library-recipe-nutrition, ADR 134). Two steps, both run by hand by the owner; see ops/library-nutrition-batch.md in the project docs.
//   RESOLVE (paid, no database): with no flag it takes a spread sample of 100 Library recipes, runs them through the resolver (the one Fill nutrition uses) with a file cache, prints the
//   projected cost and coverage for the whole Library and the typical-portion medians, and writes only the cache and results files. --full runs every recipe. Total spend across runs is
//   capped by --ceiling (50 USD): the run stops before the next recipe once it is reached. A second run pays nothing for lines already in the cache, and skips recipes already finished.
//   Needs ANTHROPIC_API_KEY and USDA_API_KEY (the owner's wrapper fetches them; never pasted into a command).
//   APPLY (free): --load reads a results file and writes `catalog_items.nutrition` in the one database DATABASE_URL names. Dry unless --apply is given; applying the same file twice changes nothing.
// Run with tsx: it imports the app's TypeScript.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '../server/db/connection.ts';
import { DEFAULT_MODEL, resolveLines } from '../server/ingredients.ts';
import { WBC_URL, mapWbc } from '../server/scripts/recipeImport.ts';
import { PORTION_G } from '../src/shared/libraryNutrition.ts';
import {
  applyResults, DEFAULT_CEILING_USD, DEFAULT_PRICE, emptyResults, estimatorError, memoryCache, parseResults, portionMedians, project, resolveRecipes, sampleOf, SAMPLE_SIZE, USDA_MS_PER_LINE,
} from '../server/scripts/catalogNutrition.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { values } = parseArgs({
  options: {
    full: { type: 'boolean', default: false }, results: { type: 'string', default: 'catalog-nutrition-results.json' }, cache: { type: 'string', default: 'catalog-nutrition-cache.json' },
    file: { type: 'string' }, ceiling: { type: 'string', default: String(DEFAULT_CEILING_USD) }, 'price-in': { type: 'string', default: String(DEFAULT_PRICE.inUsd) }, 'price-out': { type: 'string', default: String(DEFAULT_PRICE.outUsd) },
    model: { type: 'string' }, load: { type: 'string' }, apply: { type: 'boolean', default: false },
  },
});
const log = msg => console.log(msg);
const save = (path, data) => { writeFileSync(`${path}.tmp`, JSON.stringify(data)); renameSync(`${path}.tmp`, path); };

if (values.load) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Usage: npm run catalog:nutrition -- --load=<results file> [--apply]   (DATABASE_URL must be set)'); process.exit(2); }
  const target = new URL(url);
  console.log(JSON.stringify({ msg: values.apply ? 'writing' : 'dry run (add --apply to write)', database: `${target.hostname}${target.pathname}`, file: values.load }));
  const db = createDb(url);
  try {
    console.log(JSON.stringify(await applyResults(db, parseResults(JSON.parse(readFileSync(values.load, 'utf8'))), { apply: values.apply })));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'catalog:nutrition apply failed', error: err instanceof Error ? err.message : String(err) }));
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
} else {
  const key = process.env.ANTHROPIC_API_KEY, usdaKey = process.env.USDA_API_KEY;
  const ceiling = Number(values.ceiling), price = { inUsd: Number(values['price-in']), outUsd: Number(values['price-out']) };
  if (!key || !usdaKey || !(ceiling > 0) || !(price.inUsd >= 0) || !(price.outUsd >= 0)) {
    console.error('Usage: ANTHROPIC_API_KEY=... USDA_API_KEY=... npm run catalog:nutrition -- [--full] [--results=f] [--cache=f] [--file=recipes_parsed.json] [--ceiling=50] [--price-in=usd/M] [--price-out=usd/M] [--model=id]');
    process.exit(2);
  }
  const dataset = values.file ? JSON.parse(readFileSync(values.file, 'utf8')) : await (await fetch(WBC_URL, { signal: AbortSignal.timeout(60_000) })).json();
  const all = mapWbc(dataset).rows.map(r => ({ id: r.id, cat: r.data.recipe.cat, ing: r.data.recipe.ing, ...(r.data.recipe.servings ? { servings: r.data.recipe.servings } : {}) }));
  const chosen = values.full ? all : sampleOf(all, SAMPLE_SIZE);
  const results = existsSync(values.results) ? parseResults(JSON.parse(readFileSync(values.results, 'utf8'))) : emptyResults();
  const store = existsSync(values.cache) ? JSON.parse(readFileSync(values.cache, 'utf8')) : {};
  const cache = memoryCache(store);
  const model = values.model || process.env.INGREDIENTS_MODEL || DEFAULT_MODEL;
  console.log(JSON.stringify({ msg: values.full ? 'resolving the whole Library' : `resolving a sample of ${chosen.length} (add --full for all ${all.length})`, model, ceilingUsd: ceiling, spentSoFarUsd: results.spentUsd, results: values.results, cache: values.cache }));
  let done = 0;
  const rep = await resolveRecipes({
    recipes: chosen, results, price, ceilingUsd: ceiling, msPerLine: USDA_MS_PER_LINE, sleep: ms => new Promise(r => setTimeout(r, ms)), log,
    resolve: async lines => {
      const out = await resolveLines(lines, { ask: fetch, key, usdaKey, model, cache });
      // Saved as it goes: an interrupted run keeps every paid line and finished recipe.
      if (++done % 10 === 0) { save(values.cache, store); save(values.results, results); }
      return out;
    },
  });
  save(values.cache, store); save(values.results, results);
  const projection = project(all, rep, results, new Set(Object.keys(store)), ceiling);
  const medians = portionMedians(all, results);
  const err = estimatorError(all, results, { ...medians.byCat }, medians.fallback);
  console.log(JSON.stringify({ report: rep, projection, portions: medians, servingsEstimator: err, currentPortionG: PORTION_G }, null, 2));
  if (projection.overCeiling) console.log(`PROJECTION IS OVER THE CEILING (${projection.projectedUsd.toFixed(2)} > ${ceiling}): stop and take it back to the resolver brief.`);
  console.log(`Nothing was written to a database. Apply a finished file with: npm run catalog:nutrition -- --load=${values.results} [--apply]`);
}
