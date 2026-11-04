import { cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';
import { cleanUsual, isUnit } from '../shared/recipes.js';
import { pluralOf } from './foodUnit.js';

/* ---------- Ready-made food form (brief recipe-first-diet-log): what the typed boxes mean, or why they can't be saved. Pure; the form calls this. ---------- */

export interface ReadyMadeText { n: string; kcal: string; p: string; c: string; f: string; pack?: string; usual?: string; unit?: string; plural?: string }
/** `servings` is servings per pack (brief whole-pack): the recipe's existing whole-number servings field, left out when blank. */
/** `usual`, `unit` and `plural` are the usual amount and the unit name with its plural (brief usual-amount-and-unit), each left out when blank. */
export type ReadyMadeValues = { kcal: number; p: number; c?: number; f?: number; servings?: number; usual?: number; unit?: string; plural?: string };

/** The numbers a ready-made food saves with, or the sentence to show. Name, calories and protein are needed; carbs and fat are optional. */
export function readyMadeValues(t: ReadyMadeText): { error: string } | ReadyMadeValues {
  if (!t.n.trim()) return { error: 'Give the food a name.' };
  const kcal = cleanKcal(Number(t.kcal)), p = cleanProtein(Number(t.p));
  if (!t.kcal.trim() || kcal === null) return { error: 'Calories per serving must be a number from 1 to 9,999.' };
  if (!t.p.trim() || p === null) return { error: 'Protein per serving must be a number from 0 to 999 g.' };
  const c = t.c.trim() ? cleanGrams(Number(t.c)) : undefined, f = t.f.trim() ? cleanGrams(Number(t.f)) : undefined;
  if (c === null || f === null) return { error: 'Carbs and fat per serving must be numbers from 0 to 999 g.' };
  const pack = (t.pack ?? '').trim();
  const servings = pack === '' || pack === '0' ? undefined : /^\d{1,2}$/.test(pack) ? Number(pack) : null;
  if (servings === null) return { error: 'Servings per pack must be a whole number from 1 to 99.' };
  const usualText = (t.usual ?? '').trim();
  const usualNum = usualText === '' ? undefined : Number(usualText);
  if (usualNum !== undefined && cleanUsual(usualNum) === null && usualNum !== 1) return { error: 'Usual amount must be from 0.5 to 99 in half steps, like 4 or 1.5.' };
  const unit = (t.unit ?? '').trim(), plural = (t.plural ?? '').trim();
  if (unit && !isUnit(unit)) return { error: 'The unit name must be 1 to 20 letters, like egg or slice.' };
  if (plural && !unit) return { error: 'Add the unit name first, or clear the plural.' };
  if (plural && !isUnit(plural)) return { error: 'The plural must be 1 to 20 letters, like loaves.' };
  return { kcal, p, ...(c !== undefined ? { c } : {}), ...(f !== undefined ? { f } : {}), ...(servings !== undefined ? { servings } : {}), ...(usualNum !== undefined && usualNum !== 1 ? { usual: usualNum } : {}), ...(unit ? { unit } : {}), ...(unit && plural && plural.toLowerCase() !== pluralOf(unit).toLowerCase() ? { plural } : {}) };
}
