import type { Recipe, RecipeCategory } from '../types.ts';
import { nameWords } from './recipePantry.js';

/* ---------- Which of your recipes the list shows (ADR 084): pure, so a rule here is a node test, not a browser test ---------- */

export interface RecipeFilter { q: string; cat: RecipeCategory | null; canMake: boolean }

const textWords = (s: string) => s.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Your recipes matching the typed words (every word in the name or an ingredient, as a word start), the category, and "can make"
 *  (`makeable`: ids of recipes with every ingredient at home), by name. */
export function filterRecipes(list: Recipe[], f: RecipeFilter, makeable: ReadonlySet<string>): Recipe[] {
  const words = textWords(f.q);
  return list
    .filter(r => (!f.cat || r.cat === f.cat) && (!f.canMake || makeable.has(r.id)))
    .filter(r => {
      if (!words.length) return true;
      const hay = ` ${textWords(`${r.n} ${r.ing.map(i => `${i.n} ${i.sub ?? ''}`).join(' ')}`).join(' ')}`;
      return words.every(w => hay.includes(` ${w}`));
    })
    .sort((a, b) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** The line under a recipe in a list: "Sauces · 4 servings · 25 min". */
export function recipeMeta(label: string, servings?: number, minutes?: number): string {
  const time = minutes ? (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`) : '';
  return [label, servings ? `${servings} serving${servings === 1 ? '' : 's'}` : '', time].filter(Boolean).join(' · ');
}

/** Steps typed one per line, as a list (blank lines dropped). */
export const stepsFromText = (t: string): string[] => t.split('\n').map(s => s.trim()).filter(Boolean);

/** Whether a typed name is one the person already has as a recipe (used to warn, not to refuse). */
export const sameName = (list: Recipe[], name: string, exceptId?: string) => list.some(r => r.id !== exceptId && nameWords(r.n).join(' ') === nameWords(name).join(' '));
