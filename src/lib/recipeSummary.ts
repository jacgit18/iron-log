import type { DietEntry, Recipe } from '../types.ts';
import { MON, parseDate } from '../shared/dates.js';
import { ateEntry, hasMacros, shiftDay } from './dietLog.js';
import { amountText, usualStart } from './foodUnit.js';
import { runInstantLog, type AddEntry } from './instantLog.js';
import { macroLine, type MacroParts } from './macroLine.js';

/* ---------- The recipe page's summary strip and "Add to today" (brief recipe-page-after-log). Pure: the page passes in what it read and keeps only state and markup. ---------- */

type Basis = Pick<Recipe, 'id' | 'n' | 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual' | 'unit' | 'plural' | 'micro'>;

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

/** The strip's last-eaten cell: "Last eaten Tue, usual 1.5 portions", or "Not eaten yet" (with the usual when one is saved). A recipe not in Mine has none (null). The usual shown is what "Add to today" logs. */
export function lastEatenText(recipe: Basis, diet: readonly DietEntry[], today: string, mine: boolean): string | null {
  if (!mine) return null;
  const last = lastEaten(diet, recipe.id);
  const usual = amountText(usualStart(recipe), recipe);
  if (last) return `Last eaten ${eatenDayText(last.d, today)}, usual ${usual}`;
  return recipe.usual !== undefined ? `Not eaten yet, usual ${usual}` : 'Not eaten yet';
}

/** "3 of 5 at home", or null when the recipe has no ingredients or there are no inventory items to check them against. */
export const atHomeText = (have: number, total: number, inventoryItems: number): string | null => (total > 0 && inventoryItems > 0 ? `${have} of ${total} at home` : null);

/** The per-serving numbers for the strip: a meal's rolled-up numbers when it has parts, else the recipe's own. "" when there are none. */
export const stripMacros = (recipe: MacroParts, rolled: MacroParts | null): string => macroLine(rolled ?? recipe);

/** What the first action reads: `add` (Add to today), `added` (until Undo or leaving the page), `needs-numbers` (Add them: no calories and protein to log), `to-mine` (a library recipe: Add to Mine). */
export type AddState = 'add' | 'added' | 'needs-numbers' | 'to-mine';
export function addState(o: { mine: boolean; recipe: Pick<Recipe, 'kcal' | 'p'>; added: boolean }): AddState {
  if (!o.mine) return 'to-mine';
  if (!hasMacros(o.recipe)) return 'needs-numbers';
  return o.added ? 'added' : 'add';
}

/** The day "Plan…" opens on. */
export const planDay = (today: string): string => shiftDay(today, 1);

export type AddedToday = { ok: true; id: string; text: string } | { ok: false; error: string };

/** Log the recipe's usual portion for today in one go (through `runInstantLog` and the same entry `ateEntry` makes for the log control and the portion sheet). The store's own words win when it refuses (a full day). */
export function addToToday(add: AddEntry, recipe: Basis, today: string): AddedToday {
  const amount = usualStart(recipe);
  const made = ateEntry(recipe, amount, today, today);
  if ('error' in made) return { ok: false, error: made.error };
  const r = runInstantLog(add, [made.entry]);
  const id = r.ids[0];
  if (r.error || !id) return { ok: false, error: r.error ?? 'Couldn’t log that.' };
  return { ok: true, id, text: `Logged ${recipe.n}, ${amountText(amount, recipe)}, for today.` };
}
