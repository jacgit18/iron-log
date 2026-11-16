import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import type { LineMatch } from '../../src/shared/ingredientMatch.ts';
import { cleanLineMatch, normalizeLine } from '../../src/shared/ingredientMatch.ts';
import { cacheKey, type Resolved } from '../ingredients.ts';
import { startTestDatabase } from '../test/postgres.ts';
import {
  applyResults, costUsd, emptyResults, estimatorError, memoryCache, needsRetry, outcomeOf, parseResults, portionMedians, project, resolveRecipes, rollUp, sampleOf, type BatchRecipe,
} from './catalogNutrition.ts';

// A fake resolver stands in for the model and USDA: every line is "100 g of a food at 200 kcal / 10 p / 20 c / 5 f per 100 g", so a recipe's numbers are easy to check by hand.
const food = (line: string, over: Partial<LineMatch> = {}): LineMatch => ({
  line, status: 'matched', fdcId: 1, food: 'Test food', grams: 100, gramsFrom: 'text', confidence: 'high', per100: { id: 1, name: 'Test food', kcal: 200, p: 10, c: 20, f: 5, micro: { iron: 2 } }, ...over,
});
const PRICE = { inUsd: 1, outUsd: 1 };
/** A resolver that answers `answer(line)` per line, charges 1000 tokens each way per uncached distinct line, and uses the cache like the real one. */
function fake(store: Record<string, unknown>, answer: (line: string) => LineMatch) {
  const cache = memoryCache(store);
  const calls: string[][] = [];
  const resolve = async (lines: string[]): Promise<Resolved> => {
    calls.push(lines);
    const keys = lines.map(cacheKey);
    const hit = await cache.get([...new Set(keys)]);
    const todo = [...new Set(keys.filter(k => !hit.has(k)))];
    const fresh = new Map(todo.map(k => [k, answer(lines[keys.indexOf(k)]!)]));
    await cache.put([...fresh].flatMap(([k, m]) => (m.retry ? [] : [{ key: k, result: { ...m, line: undefined } }])));
    return { ok: true, cached: hit.size, usage: { calls: todo.length ? 2 : 0, inputTokens: 1000 * todo.length, outputTokens: 1000 * todo.length }, lines: lines.map((l, i) => ({ ...(fresh.get(keys[i]!) ?? cleanLineMatch(hit.get(keys[i]!), l)), line: l })) };
  };
  return { resolve, calls, store };
}
const recipe = (id: string, ing: string[], over: Partial<BatchRecipe> = {}): BatchRecipe => ({ id, cat: 'protein', ing, ...over });

describe('rollUp and outcomeOf', () => {
  it('sums grams over 100 times the food row, keeps a nutrient any counted line lists, and ignores skip, none and ungrammed lines', () => {
    const lines = [food('a', { grams: 200 }), food('b', { grams: 50, per100: { id: 2, name: 'x', kcal: 100, p: 0, c: 0, f: 0 } }), { line: 'water', status: 'skip' } as LineMatch, { line: 'z', status: 'none' } as LineMatch];
    expect(rollUp(lines)).toEqual({ kcal: 450, p: 20, c: 40, f: 10, micro: { iron: 4 } });
  });

  it('divides by the source servings and does not flag them, even when it is 1', () => {
    const r = recipe('c:wbc:a', ['a', 'b'], { servings: 1 });
    const o = outcomeOf(r, [food('a'), food('b')]);
    expect(o).toMatchObject({ kind: 'record', record: { kcal: 400, p: 20, servings: 1, of: 2, n: 2 } });
    expect((o as { record: { sEst?: true } }).record.sEst).toBeUndefined();
  });

  it('estimates and flags servings when the source has none (never a silent 1)', () => {
    const r = recipe('c:wbc:a', ['a', 'b', 'c', 'd'], { cat: 'protein' });
    const o = outcomeOf(r, ['a', 'b', 'c', 'd'].map(l => food(l, { grams: 250 })));
    expect(o).toMatchObject({ kind: 'record', record: { servings: 4, sEst: true, kcal: 500 } });
  });

  it('gives no numbers under the half floor, and says why', () => {
    const o = outcomeOf(recipe('c:wbc:a', ['a', 'b', 'c'], { servings: 2 }), [food('a'), { line: 'b', status: 'none' }, { line: 'c', status: 'none' }]);
    expect(o).toMatchObject({ kind: 'none' });
  });

  it('holds a recipe with a retry line: it is neither a record nor "no match"', () => {
    const lines = [food('a'), { line: 'b', status: 'none', retry: true } as LineMatch];
    expect(needsRetry(lines)).toBe(true);
    expect(outcomeOf(recipe('c:wbc:a', ['a', 'b'], { servings: 2 }), lines)).toEqual({ kind: 'retry' });
  });
});

describe('resolveRecipes', () => {
  const recipes = [recipe('c:wbc:a', ['1 egg', '2 cups flour'], { servings: 2 }), recipe('c:wbc:b', ['1 egg', '1 cup milk'], { servings: 2 })];

  it('pays for each distinct line once: the shared "1 egg" is cached for the second recipe, and a second run pays nothing', async () => {
    const f = fake({}, food), results = emptyResults();
    const rep = await resolveRecipes({ recipes, results, resolve: f.resolve, price: PRICE, ceilingUsd: 50 });
    expect(rep).toMatchObject({ attempted: 2, records: 2, uncachedLines: 3 }); // egg, flour, milk: the second recipe's egg is cached
    expect(rep.runUsd).toBeCloseTo(costUsd({ inputTokens: 3000, outputTokens: 3000 }, PRICE));
    const again = await resolveRecipes({ recipes, results, resolve: f.resolve, price: PRICE, ceilingUsd: 50 });
    expect(again).toMatchObject({ attempted: 0, alreadyDone: 2, runUsd: 0 });
    // With the results file lost but the cache kept, the lines are still free.
    const fresh = emptyResults();
    const third = await resolveRecipes({ recipes, results: fresh, resolve: f.resolve, price: PRICE, ceilingUsd: 50 });
    expect(third.runUsd).toBe(0);
    expect(fresh.records).toEqual(results.records);
  });

  it('stops before the next recipe once the total spend (across runs) reaches the ceiling', async () => {
    const f = fake({}, food), results = emptyResults();
    const rep = await resolveRecipes({ recipes, results, resolve: f.resolve, price: { inUsd: 1e6, outUsd: 0 }, ceilingUsd: 1000 });
    expect(rep.stoppedAtCeiling).toBe(true);
    expect(rep.attempted).toBe(1);
    expect(Object.keys(results.records)).toEqual(['c:wbc:a']);
    results.spentUsd = 1000; // a later run starts from what was spent
    expect((await resolveRecipes({ recipes: [recipes[1]!], results, resolve: f.resolve, price: PRICE, ceilingUsd: 1000 })).attempted).toBe(0);
  });

  it('retries a line the resolver could not work out on a second pass, and never stores it as no match', async () => {
    let tries = 0;
    const f = fake({}, line => (line === 'flaky' && tries++ === 0 ? { line, status: 'none', retry: true } : food(line)));
    const results = emptyResults();
    const rep = await resolveRecipes({ recipes: [recipe('c:wbc:a', ['flaky', 'ok'], { servings: 2 })], results, resolve: f.resolve, price: PRICE, ceilingUsd: 50 });
    expect(f.calls).toHaveLength(2);
    expect(rep).toMatchObject({ records: 1, unfinished: 0 });
    expect(results.records['c:wbc:a']).toMatchObject({ of: 2, n: 2 });
  });

  it('leaves a recipe whose line still fails after the passes out of the file (unfinished, not "none"), so the next run tries again', async () => {
    const f = fake({}, line => (line === 'flaky' ? { line, status: 'none', retry: true } : food(line)));
    const results = emptyResults();
    const rep = await resolveRecipes({ recipes: [recipe('c:wbc:a', ['flaky', 'ok'], { servings: 2 })], results, resolve: f.resolve, price: PRICE, ceilingUsd: 50 });
    expect(rep).toMatchObject({ unfinished: 1, records: 0, none: 0 });
    expect(results.records).toEqual({});
    expect(results.none).toEqual({});
    expect(Object.keys(f.store).some(k => k === cacheKey('flaky'))).toBe(false);
  });

  it('throttles under the USDA allowance by uncached line, and keeps going after a failed recipe', async () => {
    const f = fake({}, food), slept: number[] = [];
    let n = 0;
    const resolve = (lines: string[]) => (n++ === 0 ? Promise.reject(new Error('boom')) : f.resolve(lines));
    const rep = await resolveRecipes({ recipes, results: emptyResults(), resolve, price: PRICE, ceilingUsd: 50, msPerLine: 100, sleep: async ms => { slept.push(ms); } });
    expect(rep.failed).toBe(1);
    expect(rep.records).toBe(1);
    expect(slept).toEqual([200]);
  });
});

describe('sampleOf, project, portions', () => {
  const many = Array.from({ length: 300 }, (_, i) => recipe(`c:wbc:r${String(i).padStart(3, '0')}`, [`line ${i}`, 'shared'], { servings: 4 }));

  it('takes a spread of n, the same each time, and everything when the list is shorter', () => {
    const s = sampleOf(many, 100);
    expect(s).toHaveLength(100);
    expect(s[0]!.id).toBe('c:wbc:r000');
    expect(s[99]!.id).toBe('c:wbc:r297');
    expect(sampleOf(many, 100)).toEqual(s);
    expect(sampleOf(many.slice(0, 5), 100)).toHaveLength(5);
  });

  it('projects cost from the sample per uncached line over the Library\'s distinct lines, and flags a projection over the ceiling', async () => {
    const f = fake({}, food), results = emptyResults();
    const sample = sampleOf(many, 100);
    const rep = await resolveRecipes({ recipes: sample, results, resolve: f.resolve, price: PRICE, ceilingUsd: 50 });
    const p = project(many, rep, results, new Set(Object.keys(f.store)), 50);
    expect(rep.uncachedLines).toBe(101); // 100 unique lines plus "shared" once
    expect(p.distinctLines).toBe(301);
    expect(p.projectedUsd).toBeCloseTo(results.spentUsd + (rep.runUsd / 101) * 200);
    expect(p.coverage).toBe(1);
    expect(p.overCeiling).toBe(false);
    expect(project(many, rep, results, new Set(), 0.0001).overCeiling).toBe(true);
  });

  it('sets typical portions from recipes with known servings, per category with enough of them, and measures the estimator on them', () => {
    const results = emptyResults();
    const rs = Array.from({ length: 12 }, (_, i) => recipe(`c:wbc:p${i}`, ['x'], { cat: 'protein', servings: 4 }));
    rs.forEach(r => { results.portions[r.id] = { g: 1000, s: 4 }; });
    const odd = recipe('c:wbc:o', ['x'], { cat: 'dessert', servings: 2 });
    results.portions[odd.id] = { g: 300, s: 2 };
    const { byCat, counts, fallback } = portionMedians([...rs, odd], results);
    expect(byCat).toEqual({ protein: 250 });
    expect(counts).toEqual({ protein: 12, dessert: 1 });
    expect(fallback).toBe(250);
    expect(estimatorError([...rs, odd], results, byCat)).toMatchObject({ n: 13, within50: 1 });
    expect(estimatorError([], results, byCat)).toBeNull();
  });
});

describe('results file and the retry contract', () => {
  it('reads back what it wrote and refuses anything else', () => {
    const r = emptyResults();
    expect(parseResults(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(() => parseResults({})).toThrow();
    expect(() => parseResults(null)).toThrow();
  });
  it('the resolver keeps a retry line a retry line when it is read back', () => {
    expect(cleanLineMatch({ status: 'none', retry: true }, 'x')).toEqual({ line: 'x', status: 'none', retry: true });
    expect(normalizeLine('Flour.')).toBe('flour');
  });
});

describe('applyResults', () => {
  let db: Kysely<DB>;
  let stop: () => Promise<void>;
  beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
  afterAll(async () => { await stop?.(); });
  beforeEach(async () => { await db.deleteFrom('catalog_items').execute(); });

  const add = (id: string, ing: string[], retired = false) => db.insertInto('catalog_items').values({
    id, kind: 'recipe', name: id, brand: null, source: 'wbc', license: 'x', data: JSON.stringify({ recipe: { cat: 'protein', ing, steps: ['s'] } }), retired_at: retired ? new Date() : null,
  }).execute();
  const nutrition = () => db.selectFrom('catalog_items').select(['id', 'nutrition']).orderBy('id').execute();

  it('writes the record once; applying the same file again changes nothing; a dry run writes nothing', async () => {
    await add('c:wbc:a', ['1 egg', '2 cups flour']);
    const results = emptyResults();
    await resolveRecipes({ recipes: [recipe('c:wbc:a', ['1 egg', '2 cups flour'], { servings: 2 })], results, resolve: fake({}, food).resolve, price: PRICE, ceilingUsd: 50 });
    expect(await applyResults(db, results, { apply: false })).toMatchObject({ applied: false, written: 1 });
    expect((await nutrition())[0]!.nutrition).toBeNull();
    expect(await applyResults(db, results, { apply: true })).toMatchObject({ applied: true, written: 1, unchanged: 0 });
    const once = await nutrition();
    expect(once[0]!.nutrition).toMatchObject({ kcal: 200, servings: 2, of: 2, n: 2 });
    expect(await applyResults(db, results, { apply: true })).toMatchObject({ written: 0, unchanged: 1 });
    expect(await nutrition()).toEqual(once);
  });

  it('leaves a row whose ingredient lines changed since the run (stale hash), a retired row and a missing row alone', async () => {
    await add('c:wbc:a', ['1 egg', 'CHANGED']);
    await add('c:wbc:gone', ['1 egg', '2 cups flour'], true);
    const results = emptyResults();
    const flow = fake({}, food);
    await resolveRecipes({ recipes: [recipe('c:wbc:a', ['1 egg', '2 cups flour'], { servings: 2 }), recipe('c:wbc:gone', ['1 egg', '2 cups flour'], { servings: 2 }), recipe('c:wbc:nowhere', ['1 egg', '2 cups flour'], { servings: 2 })], results, resolve: flow.resolve, price: PRICE, ceilingUsd: 50 });
    expect(await applyResults(db, results, { apply: true })).toMatchObject({ written: 0, stale: 1, missing: 2 });
    expect((await nutrition()).every(r => r.nutrition === null)).toBe(true);
  });
});
