import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Kysely } from 'kysely';
import type { RecipeCategory } from '../../src/types.ts';
import type { DB } from '../db/types.ts';
import { cleanMicro, type Micro } from '../../src/shared/foodMicro.ts';
import { NUTRIENT_KEYS } from '../../src/shared/nutrientKeys.ts';
import type { LineMatch } from '../../src/shared/ingredientMatch.ts';
import {
  cleanNutrition, countLines, estimateServings, ingredientHash, isCounted, NUTRITION_VERSION, passesShowRule, perServing, PORTION_FALLBACK_G, PORTION_G, servingsFor, totalGrams, type LibraryNutrition,
} from '../../src/shared/libraryNutrition.ts';
import { cacheKey, RESOLVER_VERSION, type MatchCache, type Resolved } from '../ingredients.ts';

// catalog:nutrition (brief library-recipe-nutrition, ADR 134): works out estimated per-serving numbers for every Library recipe once. Two steps, run by hand by the owner, never from an
// API route:
//   resolve (paid): each recipe's ingredient lines go through the resolver (server/ingredients.ts) with a file cache, and the finished recipes are written to a results file. Reads and writes no database.
//   apply (free): loads a results file into one database's `catalog_items.nutrition`, so QA, staging and production get the same file. Dry unless `apply` is given; a second apply changes nothing.
// A line the resolver could not work out this time (`none` with `retry`) is never stored as "no match": its recipe is left unfinished, run again on a later pass, and left out of the file if it still fails.

export const SAMPLE_SIZE = 100;
export const DEFAULT_CEILING_USD = 50;
/** Model prices in USD per million tokens (claude-haiku-5-5 at the time of writing); the CLI takes overrides. */
export const DEFAULT_PRICE = { inUsd: 0.10, outUsd: 0.50 };
/** USDA's key allows about 1,000 calls an hour per address (server/foodSearch.ts): one pause per uncached line keeps a full run under it. */
export const USDA_MS_PER_LINE = 3700;
/** Passes over a recipe that still has a line to retry. */
export const MAX_PASSES = 2;

export interface BatchRecipe { id: string; cat: RecipeCategory; ing: string[]; servings?: number }
export interface Price { inUsd: number; outUsd: number }

/** The results file: one finished record per catalog id, the money spent so far (the ceiling is on the total across runs) and what was left unfinished. */
export interface ResultsFile {
  version: 1;
  resolver: number;
  spentUsd: number;
  records: Record<string, LibraryNutrition>;
  /** Recipes that finished with no numbers: too few lines counted, or no servings could be found. Kept so a run does not pay for them again. */
  none: Record<string, string>;
  /** Recipes whose servings came from the source: total counted grams and those servings. What `PORTION_G` is set from and the estimator is measured against. */
  portions: Record<string, { g: number; s: number }>;
  /** Hash of the typical-portion table the estimated servings were worked out with. A different table means those records are stale: the run drops them and works them out again (their lines are cached). */
  portionsHash?: string;
}

/** A short hash of the portion table in use (the table and its fallback), in a fixed category order. */
export const portionsHashOf = (portionG: Partial<Record<RecipeCategory, number>> = PORTION_G): string =>
  createHash('sha256').update(JSON.stringify([Object.entries(portionG).sort(([a], [b]) => (a < b ? -1 : 1)), PORTION_FALLBACK_G])).digest('hex').slice(0, 12);
export const emptyResults = (): ResultsFile => ({ version: 1, resolver: RESOLVER_VERSION, spentUsd: 0, records: {}, none: {}, portions: {} });

/** A results file read back and checked again; anything unreadable is an error, never a silent empty file. */
export function parseResults(raw: unknown): ResultsFile {
  const o = raw as Partial<ResultsFile> | null;
  if (!o || typeof o !== 'object' || o.version !== 1 || typeof o.records !== 'object' || !o.records || typeof o.spentUsd !== 'number') throw new Error('not a catalog:nutrition results file');
  return { version: 1, resolver: typeof o.resolver === 'number' ? o.resolver : RESOLVER_VERSION, spentUsd: o.spentUsd, records: o.records as ResultsFile['records'], none: (o.none && typeof o.none === 'object' ? o.none : {}) as ResultsFile['none'], portions: (o.portions && typeof o.portions === 'object' ? o.portions : {}) as ResultsFile['portions'], ...(typeof o.portionsHash === 'string' ? { portionsHash: o.portionsHash } : {}) };
}

/** The resolver's cache kept in a plain object that the CLI saves as a file: `get` and `put` as the resolver wants them. */
export function memoryCache(store: Record<string, unknown>): MatchCache {
  return {
    async get(keys) { return new Map(keys.filter(k => k in store).map(k => [k, store[k]])); },
    async put(entries) { for (const e of entries) store[e.key] = e.result; },
  };
}

/* ---- Roll-up ---- */

export interface Totals { kcal: number; p: number; c: number; f: number; micro?: Micro }

/** Sums the counted lines: each food's per-100 g row times grams over 100. A nutrient is kept when at least one counted line lists it ("at least"). */
export function rollUp(lines: readonly LineMatch[]): Totals {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  const micro: Record<string, number> = {};
  for (const l of lines) {
    if (!isCounted(l) || !l.per100) continue;
    const k = (l.grams as number) / 100;
    t.kcal += l.per100.kcal * k; t.p += l.per100.p * k; t.c += (l.per100.c ?? 0) * k; t.f += (l.per100.f ?? 0) * k;
    const m = l.per100.micro;
    if (m) for (const key of NUTRIENT_KEYS) { const a = m[key]; if (typeof a === 'number') micro[key] = (micro[key] ?? 0) + a * k; }
  }
  const mc = cleanMicro(micro);
  return { ...t, ...(mc ? { micro: mc } : {}) };
}

/** True when a line needs another pass: it could not be worked out this time. */
export const needsRetry = (lines: readonly LineMatch[]): boolean => lines.some(l => l.status === 'none' && l.retry === true);

export type Outcome = { kind: 'record'; record: LibraryNutrition } | { kind: 'none'; why: string } | { kind: 'retry' };

/** One recipe's resolved lines to its outcome: a record when the show rule holds and servings are found, else `none` with the reason; `retry` while a line is still unworked. */
export function outcomeOf(r: BatchRecipe, lines: readonly LineMatch[], portionG?: Partial<Record<RecipeCategory, number>>): Outcome {
  if (needsRetry(lines)) return { kind: 'retry' };
  const counts = countLines(lines);
  if (!passesShowRule(counts)) return { kind: 'none', why: `under the floor: ${counts.of} of ${counts.n} counted${counts.trusted ? '' : ', none with trusted grams'}` };
  const sv = servingsFor(r.servings, totalGrams(lines), r.cat, portionG);
  if (!sv) return { kind: 'none', why: 'no servings' };
  const per = perServing(rollUp(lines), sv.servings);
  if (!per) return { kind: 'none', why: 'no usable numbers' };
  const record: LibraryNutrition = { ...per, servings: sv.servings, ...(sv.estimated ? { sEst: true as const } : {}), of: counts.of, n: counts.n, hash: ingredientHash(r.ing), v: NUTRITION_VERSION };
  // The same check the server runs before serving: a record that would not be served is not worth storing.
  return cleanNutrition(record, r.ing) ? { kind: 'record', record } : { kind: 'none', why: 'record failed the serve check' };
}

/* ---- Resolve step ---- */

export const costUsd = (u: { inputTokens: number; outputTokens: number }, price: Price): number => (u.inputTokens * price.inUsd + u.outputTokens * price.outUsd) / 1e6;

/** Every `step`-th recipe of the list (by id order), `n` of them: a spread over the Library rather than the first hundred in the alphabet. */
export function sampleOf<T extends { id: string }>(recipes: readonly T[], n: number): T[] {
  const sorted = [...recipes].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (sorted.length <= n) return sorted;
  const step = sorted.length / n;
  return Array.from({ length: n }, (_, i) => sorted[Math.floor(i * step)]!);
}

export interface ResolveRun {
  recipes: BatchRecipe[];
  results: ResultsFile;
  /** Stand-in for the resolver in tests; the CLI passes `resolveLines` with its file cache and keys. */
  resolve: (lines: string[]) => Promise<Resolved>;
  price: Price;
  ceilingUsd: number;
  sleep?: (ms: number) => Promise<void>;
  msPerLine?: number;
  portionG?: Partial<Record<RecipeCategory, number>>;
  log?: (msg: string) => void;
}
export interface ResolveReport {
  attempted: number;
  /** Recipes already in the results file, skipped for free. */
  alreadyDone: number;
  records: number;
  none: number;
  /** Recipes with a line still unworked after the last pass: not in the file, tried again on the next run. */
  unfinished: number;
  failed: number;
  /** Records whose servings were estimated with a different portion table, dropped at the start of this run to be worked out again. */
  rederived: number;
  stoppedAtCeiling: boolean;
  spentUsd: number;
  /** Spend of this run only, and its uncached distinct lines (what the projection divides). */
  runUsd: number;
  uncachedLines: number;
}

/** Resolves `recipes` one at a time and puts each finished one in `results` (mutated; the caller saves it after the run). Stops before the next recipe when the total spend has reached the ceiling. */
export async function resolveRecipes(run: ResolveRun): Promise<ResolveReport> {
  const { recipes, results, resolve, price, ceilingUsd, sleep = async () => {}, msPerLine = 0, portionG, log = () => {} } = run;
  const rep: ResolveReport = { attempted: 0, alreadyDone: 0, records: 0, none: 0, unfinished: 0, failed: 0, rederived: 0, stoppedAtCeiling: false, spentUsd: results.spentUsd, runUsd: 0, uncachedLines: 0 };
  // Servings estimated from the grams depend on the portion table: records made with another table are dropped (their recipes are redone below, from the cache) so apply never loads them.
  const hash = portionsHashOf(portionG);
  if (results.portionsHash !== hash) {
    for (const [id, rec] of Object.entries(results.records)) if (rec.sEst) { delete results.records[id]; rep.rederived++; }
    results.portionsHash = hash;
    if (rep.rederived > 0) log(`portion table changed: ${rep.rederived} estimated-servings records dropped, redone from the cache`);
  }
  for (const r of recipes) {
    if (r.id in results.records || r.id in results.none) { rep.alreadyDone++; continue; }
    if (results.spentUsd >= ceilingUsd) { rep.stoppedAtCeiling = true; break; }
    rep.attempted++;
    let outcome: Outcome = { kind: 'retry' };
    let last: LineMatch[] = [];
    for (let pass = 1; pass <= MAX_PASSES && outcome.kind === 'retry'; pass++) {
      let out: Resolved;
      try { out = await resolve(r.ing); } catch (err) {
        log(`${r.id}: failed (${err instanceof Error ? err.message : 'unknown'})`); rep.failed++; outcome = { kind: 'retry' };
        // A throw after a paid model call still cost money: it counts toward the ceiling.
        const spent = (err as { usage?: { inputTokens: number; outputTokens: number } } | null)?.usage;
        if (spent) { const cost = costUsd(spent, price); results.spentUsd += cost; rep.runUsd += cost; rep.spentUsd = results.spentUsd; }
        break;
      }
      if (!out.ok) { log(`${r.id}: refused (retry in ${out.retryAfterSec}s)`); rep.failed++; break; }
      const cost = costUsd(out.usage, price);
      results.spentUsd += cost; rep.runUsd += cost; rep.spentUsd = results.spentUsd;
      const uncached = new Set(r.ing.map(cacheKey)).size - out.cached;
      rep.uncachedLines += uncached;
      last = out.lines;
      outcome = outcomeOf(r, out.lines, portionG);
      if (msPerLine > 0 && uncached > 0) await sleep(msPerLine * uncached);
    }
    if (outcome.kind === 'record') {
      results.records[r.id] = outcome.record; rep.records++;
      if (r.servings && !outcome.record.sEst) results.portions[r.id] = { g: Math.round(totalGrams(last)), s: outcome.record.servings };
    }
    else if (outcome.kind === 'none') { results.none[r.id] = outcome.why; rep.none++; }
    else rep.unfinished++;
  }
  return rep;
}

export interface Projection {
  /** Recipes in the whole Library, and how many distinct lines it has after normalising. */
  library: number;
  distinctLines: number;
  costPerLineUsd: number;
  projectedUsd: number;
  /** Share of the sample's finished recipes that got numbers, and the same applied to the Library. */
  coverage: number;
  projectedCovered: number;
  overCeiling: boolean;
}

/** What the full run would cost and cover, from a sample's report: cost per uncached line times the Library's distinct lines (lines the cache already holds are not paid for again), coverage as the sample's share. */
export function project(all: readonly BatchRecipe[], rep: ResolveReport, results: ResultsFile, cachedKeys: ReadonlySet<string>, ceilingUsd: number): Projection {
  const distinct = new Set(all.flatMap(r => r.ing.map(cacheKey)));
  const todo = [...distinct].filter(k => !cachedKeys.has(k)).length;
  const costPerLine = rep.uncachedLines > 0 ? rep.runUsd / rep.uncachedLines : 0;
  const finished = Object.keys(results.records).length + Object.keys(results.none).length;
  const coverage = finished > 0 ? Object.keys(results.records).length / finished : 0;
  const projectedUsd = results.spentUsd + costPerLine * todo;
  return { library: all.length, distinctLines: distinct.size, costPerLineUsd: costPerLine, projectedUsd, coverage, projectedCovered: Math.round(coverage * all.length), overCeiling: projectedUsd > ceilingUsd };
}

const median = (xs: readonly number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2; };

/** Median grams per serving by category from finished recipes whose servings came from the source: what `PORTION_G` is set from. A category with fewer than `min` such recipes is left out (it uses the fallback, the median of all of them). */
export function portionMedians(all: readonly BatchRecipe[], results: ResultsFile, min = 10): { byCat: Partial<Record<RecipeCategory, number>>; counts: Partial<Record<RecipeCategory, number>>; fallback?: number } {
  const per = new Map<RecipeCategory, number[]>();
  for (const r of all) {
    const p = results.portions[r.id];
    if (p && p.s >= 1 && p.g > 0) per.set(r.cat, [...(per.get(r.cat) ?? []), p.g / p.s]);
  }
  const byCat: Partial<Record<RecipeCategory, number>> = {}, counts: Partial<Record<RecipeCategory, number>> = {};
  for (const [cat, xs] of per) { counts[cat] = xs.length; if (xs.length >= min) byCat[cat] = Math.round(median(xs)); }
  const every = [...per.values()].flat();
  return { byCat, counts, ...(every.length ? { fallback: Math.round(median(every)) } : {}) };
}

/** The estimator measured on the recipes with known servings: for each, the servings it would have guessed from the grams against the source's value. Median and share within 50% of the truth. */
export function estimatorError(all: readonly BatchRecipe[], results: ResultsFile, portionG: Partial<Record<RecipeCategory, number>>): { n: number; medianRelError: number; within50: number } | null {
  const errs: number[] = [];
  for (const r of all) {
    const p = results.portions[r.id];
    const est = p ? estimateServings(p.g, r.cat, portionG) : undefined;
    if (p && est) errs.push(Math.abs(est - p.s) / p.s);
  }
  if (!errs.length) return null;
  return { n: errs.length, medianRelError: median(errs), within50: errs.filter(e => e <= 0.5).length / errs.length };
}

/* ---- Apply step ---- */

export interface ApplyResult { applied: boolean; written: number; unchanged: number; stale: number; missing: number }

/** Loads a results file into catalog_items.nutrition for live Library recipes (source wbc). A row is written only when its stored record would change, and only when the record's hash still matches the row's ingredient lines (a stale record is counted and left out). A second run writes nothing. */
export async function applyResults(db: Kysely<DB>, file: ResultsFile, { apply, log = () => {} }: { apply: boolean; log?: (msg: string) => void }): Promise<ApplyResult> {
  const out: ApplyResult = { applied: apply, written: 0, unchanged: 0, stale: 0, missing: 0 };
  await db.transaction().execute(async trx => {
    for (const [id, rec] of Object.entries(file.records)) {
      const row = await trx.selectFrom('catalog_items').select(['data', 'nutrition']).where('id', '=', id).where('kind', '=', 'recipe').where('retired_at', 'is', null).executeTakeFirst();
      if (!row) { out.missing++; continue; }
      const ing = (row.data as { recipe?: { ing?: unknown } } | null)?.recipe?.ing;
      const clean = Array.isArray(ing) && ing.every(x => typeof x === 'string') ? cleanNutrition(rec, ing as string[]) : null;
      if (!clean) { out.stale++; continue; }
      if (isDeepStrictEqual(row.nutrition, clean)) { out.unchanged++; continue; }
      out.written++;
      if (apply) await trx.updateTable('catalog_items').set({ nutrition: JSON.stringify(clean) }).where('id', '=', id).execute();
    }
    log(JSON.stringify({ msg: apply ? 'applied' : 'dry run', ...out }));
  });
  return out;
}
