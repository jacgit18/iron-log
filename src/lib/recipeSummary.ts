import type { DietEntry, Recipe } from '../types.ts';
import { MON, parseDate } from '../shared/dates.js';
import { ateEntry, ateMax, hasMacros, packServings, shiftDay } from './dietLog.js';
import { amountText, usualStart } from './foodUnit.js';
import { runInstantLog, type AddEntry } from './instantLog.js';
import { macroLine, macroWords, type MacroParts } from './macroLine.js';

/* ---------- The recipe page's summary strip and "Add to today" (brief recipe-page-after-log). Pure: the page passes in what it read and keeps only state and markup. ---------- */

type Basis = Pick<Recipe, 'id' | 'n' | 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual' | 'unit' | 'plural' | 'micro' | 'est'>;

/** The newest eaten entry that came from this recipe (`from` is the recipe's id), or null. The newest day wins; on one day the later entry in the list does. */
export function lastEaten(diet: readonly DietEntry[], recipeId: string): DietEntry | null {
  let best: DietEntry | null = null;
  for (const e of diet) if (e.from === recipeId && (!best || e.d >= best.d)) best = e;
  return best;
}

/** A day in words for the strip: "today", "yesterday", a weekday within the last week ("Tue"), else a date ("3 Nov"). A day after today is a date too. */
export function eatenDayText(day: string, today: string): string {
  if (day === today) return 'today';
  if (day === shiftDay(today, -1)) return 'yesterday';
  const d = parseDate(day);
  if (day < today && day >= shiftDay(today, -6)) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}

/** One small box of the summary strip (preview 2026-11-15, option A): a bold line over a muted one. `words` is what a screen reader gets for the numbers ("P 38" would be read as a letter). */
export interface StripCell { key: 'per' | 'nonum' | 'home' | 'last'; head: string; sub: string; words?: string }

const NO_NUMBERS_SUB = 'Calories and protein per serving are missing';

/** The macro line cut after its first part: "520 kcal" over "P 38 · C 41 · F 19 g per serving". With no calories the bold line is the label "Per serving" over the grams (a bold "P 38 g" would read as the headline number). */
function perCell(m: MacroParts): StripCell | null {
  const line = macroLine(m);
  if (!line) return null;
  const [first = '', ...rest] = line.split(' · ');
  const words = `${macroWords(m)} per serving`;
  if (!first.endsWith(' kcal')) return { key: 'per', head: 'Per serving', sub: line, words }; // no calories: only a calorie figure is bold
  return { key: 'per', head: first, sub: `${rest.join(' · ')} per serving`.trim(), words };
}

/** The boxes the page shows, left to right. Per serving (a meal built from parts uses its rolled-up numbers), or "No numbers yet" for a recipe of yours with none; "N of M at home" over "N missing" (left out with no ingredients or no inventory items);
 *  "Last eaten <day>" over "Usual <amount>", or "Not eaten yet" (with the usual when one is saved), for a recipe in Mine only. The usual shown is what Add to today logs. */
export function summaryCells(o: { recipe: Basis; rolled: MacroParts | null; mine: boolean; have: number; total: number; inventoryItems: number; diet: readonly DietEntry[]; today: string }): StripCell[] {
  const cells: StripCell[] = [];
  const per = perCell(o.rolled ?? o.recipe);
  if (per && !o.rolled && o.recipe.est) cells.push({ ...per, sub: `${per.sub} · Estimated`, words: `${per.words ?? ''}, estimated from ingredients` }); // a Fill's numbers say so (brief recipe-auto-nutrition); text, not colour
  else if (per) cells.push(per);
  else if (o.mine) cells.push({ key: 'nonum', head: 'No numbers yet', sub: NO_NUMBERS_SUB });
  if (o.total > 0 && o.inventoryItems > 0) cells.push({ key: 'home', head: `${o.have} of ${o.total} at home`, sub: o.total > o.have ? `${o.total - o.have} missing` : '' });
  if (o.mine) {
    const last = lastEaten(o.diet, o.recipe.id);
    const usual = `Usual ${amountText(usualStart(o.recipe), o.recipe)}`;
    if (last) cells.push({ key: 'last', head: `Last eaten ${eatenDayText(last.d, o.today)}`, sub: usual });
    else cells.push({ key: 'last', head: 'Not eaten yet', sub: o.recipe.usual !== undefined ? usual : '' });
  }
  return cells;
}

/** What the first action reads: `add` (Add to today), `added` (until Undo or leaving the page), `needs-numbers` (Add them: no calories and protein to log), `to-mine` (a library recipe: Add to Mine). */
export type AddState = 'add' | 'added' | 'needs-numbers' | 'to-mine';
export function addState(o: { mine: boolean; recipe: Pick<Recipe, 'kcal' | 'p'>; added: boolean }): AddState {
  if (!o.mine) return 'to-mine';
  if (!hasMacros(o.recipe)) return 'needs-numbers';
  return o.added ? 'added' : 'add';
}

/** The pack size the "Whole pack (N)" button logs, or null for no button: a ready-made food of yours with numbers and a pack size one entry can hold. The same rule the portion sheet uses to show Whole pack for today (`packServings` within `ateMax`). */
export function wholePackFor(o: { mine: boolean; recipe: Pick<Recipe, 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual'> }): number | null {
  if (!o.mine || !hasMacros(o.recipe)) return null;
  const pack = packServings(o.recipe);
  return pack !== null && pack <= ateMax(o.recipe) ? pack : null;
}

/** Whether the entry "Add to today" made is still in the log: the page reads "Added" only while it is, so a delete elsewhere (the Nutrition board) brings "Add to today" back. */
export const stillAdded = (diet: readonly Pick<DietEntry, 'id'>[], id: string | null): string | null => (id !== null && diet.some(e => e.id === id) ? id : null);

/** The day "Plan…" opens on. */
export const planDay = (today: string): string => shiftDay(today, 1);

export type AddedToday = { ok: true; id: string; text: string } | { ok: false; error: string };

/** Log `amount` of the recipe for today (its usual portion unless the caller says otherwise: the whole pack) in one go (through `runInstantLog` and the same entry `ateEntry` makes for the log control and the portion sheet). The store's own words win when it refuses (a full day). */
export function addToToday(add: AddEntry, recipe: Basis, today: string, amount: number = usualStart(recipe)): AddedToday {
  const made = ateEntry(recipe, amount, today, today);
  if ('error' in made) return { ok: false, error: made.error };
  const r = runInstantLog(add, [made.entry]);
  const id = r.ids[0];
  if (r.error || !id) return { ok: false, error: r.error ?? 'Couldn’t log that.' };
  return { ok: true, id, text: `Logged ${recipe.n}, ${amountText(amount, recipe)}, for today.` };
}
