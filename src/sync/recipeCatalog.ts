/* The recipe library (ADR 084): GET /api/catalog/search?kind=recipe, read by the Recipes screen. Like the rest of the catalog it is not synced and
   not kept for offline; what you copy into Mine is your own data (recipes/main). Untrusted JSON: each recipe is checked before the app uses it. */
import { MAX_AMOUNT, MAX_INGREDIENTS, MAX_RECIPE_NAME, MAX_STEP, MAX_STEPS, RECIPE_CATEGORIES } from '../shared/recipes.js';
import type { CatalogItem, RecipeCategory } from '../types.ts';

export type RecipeSearch = { ok: true; items: CatalogItem[]; more: boolean } | { ok: false; reason: 'offline' | 'refused' | 'unreachable' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const lines = (v: unknown, max: number, limit: number): string[] => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, max)).slice(0, limit);
const whole = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : undefined);

/** One library recipe as the API sends it, or null when it is not one. */
export function cleanLibraryRecipe(raw: unknown): CatalogItem | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id.startsWith('c:') || raw.id.length > 100 || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const d = isObj(raw.data) && isObj(raw.data.recipe) ? raw.data.recipe : null;
  if (!d) return null;
  const ing = lines(d.ing, MAX_RECIPE_NAME + MAX_AMOUNT, MAX_INGREDIENTS), steps = lines(d.steps, MAX_STEP, MAX_STEPS);
  if (!ing.length || !steps.length) return null;
  const cat: RecipeCategory = RECIPE_CATEGORIES.find(c => c === d.cat) ?? 'other';
  const servings = whole(d.servings, 99), minutes = whole(d.minutes, 1440);
  return { id: raw.id, name: raw.name.trim().slice(0, MAX_RECIPE_NAME), data: { recipe: { cat, ing, steps, ...(servings ? { servings } : {}), ...(minutes ? { minutes } : {}) } } };
}

/** One page of library recipes for the typed words (none: every recipe in name order), optionally of one category. */
export async function searchRecipes(q: string, cat: RecipeCategory | null, offset: number, headers: () => Record<string, string>, doFetch: typeof fetch = fetch): Promise<RecipeSearch> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const params = new URLSearchParams({ kind: 'recipe', offset: String(offset) });
    if (q.trim()) params.set('q', q.trim());
    if (cat) params.set('cat', cat);
    const res = await doFetch(`/api/catalog/search?${params}`, { headers: { accept: 'application/json', ...headers() }, credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'refused' };
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const body = (await res.json().catch(() => undefined)) as { items?: unknown; more?: unknown } | undefined;
    if (!Array.isArray(body?.items)) return { ok: false, reason: 'unreachable' };
    return { ok: true, items: body.items.map(cleanLibraryRecipe).filter((x): x is CatalogItem => x !== null), more: body.more === true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
