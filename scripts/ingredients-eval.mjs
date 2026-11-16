#!/usr/bin/env node
// Owner-run accuracy and cost eval for Fill nutrition's resolver (brief recipe-auto-nutrition, Done when 2). Not part of CI: it calls the real Claude API and USDA with your keys
// (about 2 cents on the default model for the 174-line sample). It runs the resolver the route runs (server/ingredients.ts), recipe by recipe, with an in-memory cache, and prints:
//   1. right food: of the lines whose right food is known from the hand verdicts (top: USDA's first result for the raw name; top3: one of its first three), how many the resolver picked it for;
//   2. grams: of the lines with an `expectGrams` value in the fixture (hand-checked), how many are within 25%; the fixture ships with none, add about 40;
//   3. coverage: how many lines were matched, skipped (water, salt), not matched because nothing fits, and not matched because the USDA search failed ("try again", not a verdict on the line);
//   4. tokens and cost per recipe.
// Lines with the verdict "wrong" have no known right food: their picks are listed for you to judge by hand (the resolver can be right where the raw-name search was wrong).
//
//   ANTHROPIC_API_KEY=... USDA_API_KEY=... npx tsx scripts/ingredients-eval.mjs [--model=<id>] [--recipes=<n>] [--price-in=0.10] [--price-out=0.50] [--fixture=<file.json>]
//
// Prices are USD per million tokens (defaults: claude-haiku-5-5); check the current price list before quoting a cost. Nothing is written.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, resolveLines } from '../server/ingredients.ts';

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const model = opt('model', process.env.INGREDIENTS_MODEL || DEFAULT_MODEL);
const priceIn = Number(opt('price-in', '0.10')), priceOut = Number(opt('price-out', '0.50'));
const fixtureFile = opt('fixture', fileURLToPath(new URL('./lib/ingredients-eval-sample.json', import.meta.url)));
const key = process.env.ANTHROPIC_API_KEY, usdaKey = process.env.USDA_API_KEY;
if (!key || !usdaKey) {
  console.error('Usage: ANTHROPIC_API_KEY=... USDA_API_KEY=... npx tsx scripts/ingredients-eval.mjs [--model=<id>] [--recipes=<n>] [--price-in=<usd/M>] [--price-out=<usd/M>] [--fixture=<file>]');
  process.exit(2);
}
const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
const byRecipe = new Map();
for (const l of fixture.lines) byRecipe.set(l.recipe, [...(byRecipe.get(l.recipe) ?? []), l]);
const recipes = [...byRecipe.entries()].slice(0, Number(opt('recipes', String(byRecipe.size))));

const cache = { map: new Map(), async get(keys) { return new Map(keys.filter(k => this.map.has(k)).map(k => [k, this.map.get(k)])); }, async put(es) { for (const e of es) this.map.set(e.key, e.result); } };
console.log(`model: ${model}; ${recipes.length} recipes, ${recipes.reduce((n, [, ls]) => n + ls.length, 0)} lines`);

let known = 0, knownRight = 0, grams = 0, gramsOk = 0, tokensIn = 0, tokensOut = 0, failed = 0;
const seen = { matched: 0, skip: 0, none: 0, retry: 0 };
// A `none` with `retry` means the USDA search failed for that line: the resolver has no answer yet, which is not the same as "nothing fits".
const shown = m => (m.status === 'none' && m.retry ? 'none (try again: the USDA search failed)' : m.status);
const review = [];
for (const [name, ls] of recipes) {
  let out;
  try { out = await resolveLines(ls.map(l => l.line), { ask: fetch, key, usdaKey, model, cache }); } catch (err) { failed++; console.log(`${name}: failed (${err instanceof Error ? err.message : 'unknown'})`); continue; }
  if (!out.ok) continue;
  tokensIn += out.usage.inputTokens; tokensOut += out.usage.outputTokens;
  out.lines.forEach((m, i) => {
    const f = ls[i];
    const picked = m.status === 'matched' ? m.food : null;
    seen[m.status === 'none' && m.retry ? 'retry' : m.status]++;
    if (f.verdict === 'top' || f.verdict === 'top3') {
      known++;
      const right = picked !== null && (f.verdict === 'top' ? picked === f.usda[0] : f.usda.includes(picked));
      if (right) knownRight++; else console.log(`  MISS  ${name}: "${f.line}" -> ${shown(m)}${picked ? ` ${picked}` : ''} (expected ${f.verdict === 'top' ? f.usda[0] : f.usda.join(' | ')}; a MISS can be another correct food, judge by hand)`);
    } else review.push(`${name}: "${f.line}" -> ${shown(m)}${picked ? ` ${picked} ${m.grams} g (${m.gramsFrom}, ${m.confidence})` : ''}`);
    if (typeof f.expectGrams === 'number') {
      grams++;
      if (m.status === 'matched' && Math.abs(m.grams - f.expectGrams) <= 0.25 * f.expectGrams) gramsOk++; else console.log(`  GRAMS ${name}: "${f.line}" -> ${m.grams ?? m.status} g (hand ${f.expectGrams} g)`);
    }
  });
}
const pct = (a, b) => (b === 0 ? 'n/a' : `${Math.round((100 * a) / b)}%`);
const cost = (tokensIn * priceIn + tokensOut * priceOut) / 1e6;
console.log(`\nLines with the verdict "wrong" (no known right food), judge these picks by hand:\n${review.map(r => `  ${r}`).join('\n') || '  none'}`);
console.log(`\nSummary (${model}):`);
console.log(`  right food: ${knownRight} of ${known} lines with a known right food (${pct(knownRight, known)}); the brief's kill line is under 80% of matched lines right, so also judge the list above by hand`);
console.log(`  coverage: ${seen.matched} matched, ${seen.skip} skipped, ${seen.none} with nothing that fits, ${seen.retry} to try again (the USDA search failed; rerun before judging those lines)`);
console.log(`  grams within 25%: ${grams === 0 ? 'no lines have expectGrams in the fixture yet (hand-check about 40 and add them)' : `${gramsOk} of ${grams} (${pct(gramsOk, grams)})`}`);
console.log(`  tokens: ${tokensIn} in, ${tokensOut} out over ${recipes.length - failed} recipes; cost about ${cost.toFixed(4)} USD, ${(cost / Math.max(1, recipes.length - failed)).toFixed(5)} USD per recipe (the brief's kill line is over 0.01 USD per recipe)${failed ? `; ${failed} recipes failed` : ''}`);
