import { cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';

/* ---------- Ready-made food form (brief recipe-first-diet-log): what the typed boxes mean, or why they can't be saved. Pure; the form calls this. ---------- */

export interface ReadyMadeText { n: string; kcal: string; p: string; c: string; f: string }
export type ReadyMadeValues = { kcal: number; p: number; c?: number; f?: number };

/** The numbers a ready-made food saves with, or the sentence to show. Name, calories and protein are needed; carbs and fat are optional. */
export function readyMadeValues(t: ReadyMadeText): { error: string } | ReadyMadeValues {
  if (!t.n.trim()) return { error: 'Give the food a name.' };
  const kcal = cleanKcal(Number(t.kcal)), p = cleanProtein(Number(t.p));
  if (!t.kcal.trim() || kcal === null) return { error: 'Calories per serving must be a number from 1 to 9,999.' };
  if (!t.p.trim() || p === null) return { error: 'Protein per serving must be a number from 0 to 999 g.' };
  const c = t.c.trim() ? cleanGrams(Number(t.c)) : undefined, f = t.f.trim() ? cleanGrams(Number(t.f)) : undefined;
  if (c === null || f === null) return { error: 'Carbs and fat per serving must be numbers from 0 to 999 g.' };
  return { kcal, p, ...(c !== undefined ? { c } : {}), ...(f !== undefined ? { f } : {}) };
}
