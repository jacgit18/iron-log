import type { RecipeCategory } from '../../src/types.ts';
import { MAX_AMOUNT, MAX_INGREDIENTS, MAX_RECIPE_NAME, MAX_STEP, MAX_STEPS } from '../../src/shared/recipes.ts';
import type { CatalogRow, Mapped } from './catalogImport.ts';

// catalog:import --source wbc (ADR 084): library recipes from the Wikibooks Cookbook, as parsed by gossminn/wikibooks-cookbook on Hugging Face
// (cc-by-sa-4.0; the recipes are Wikibooks text, also CC BY-SA 4.0, so every row carries the license and the app shows the attribution).
// Pinned to one dataset commit: a re-import of newer data is a deliberate change to this line. Rows become catalog_items of kind 'recipe'.

export const WBC_COMMIT = '49fb73ea07d2a1380c15197db5589934937457ed';
export const WBC_URL = `https://huggingface.co/datasets/gossminn/wikibooks-cookbook/resolve/${WBC_COMMIT}/recipes_parsed.json`;
export const WBC_LICENSE = 'CC BY-SA 4.0 (Wikibooks Cookbook, via gossminn/wikibooks-cookbook)';

export interface WbcLine { text?: string; line_type?: string; section?: string | null }
export interface WbcRecord {
  filename?: string;
  recipe_data?: { url?: string; title?: string; infobox?: { category?: string | null; servings?: string | null; time?: string | null } | null; text_lines?: WbcLine[] };
}

// The Wikibooks category slug (Category:Sauce_recipes) → our category. The first rule that matches wins, so a "salad dressing" is a sauce
// and a "chicken salad" a protein before it is a side. A category with no rule, or none at all, is Other.
// A rule matches whole words of the slug (split on _), so 'tea' is not found in 'steak', 'oat' in 'goat', or 'tart' in 'starter'.
const words = (re: RegExp) => new RegExp(`(^|_)(?:${re.source})(_|$)`);
const RULES: [RecipeCategory, RegExp][] = [
  ['seasonings', /spice|seasoning|rub|herb_mix|spice_mix/],
  ['sauces', /sauce|dressing|dip|marinade|gravy|condiment|chutney|salsa|spread/],
  ['drinks', /beverage|drink|cocktail|smoothie|tea|coffee|juice/],
  ['breakfast', /breakfast|pancake|waffle|porridge|oat/],
  ['dessert', /dessert|cake|cookie|pudding|pastry|confection|pie|tart|ice_cream|candy/],
  ['protein', /chicken|meat|pork|beef|lamb|turkey|fish|seafood|shrimp|egg|tofu|bean|lentil|steak|sausage/],
  ['carbs', /rice|potato|bread|flatbread|pasta|noodle/],
  ['sides', /salad|vegetable|side_dish|sandwich/],
];
const CATEGORY_RULES = RULES.map(([cat, re]): [RecipeCategory, RegExp] => [cat, words(re)]);
export function wbcCategory(slug: string | null | undefined): RecipeCategory {
  const raw = (slug ?? '').replace(/^.*Category:/, '').split('&')[0] ?? '';
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* a bad percent escape: use the slug as it is */ }
  s = s.toLowerCase();
  return CATEGORY_RULES.find(([, re]) => re.test(s))?.[0] ?? 'other';
}

const whole = (n: number, max: number) => (Number.isFinite(n) && n >= 1 && n <= max ? Math.round(n) : undefined);
const servingsOf = (t: string | null | undefined) => whole(Number(/\d+/.exec(t ?? '')?.[0]), 99);
/** "8 h, 10 minutes" → 490; anything it cannot read gives nothing. */
export function minutesOf(t: string | null | undefined): number | undefined {
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/i.exec(t ?? ''), m = /(\d+)\s*(?:min)/i.exec(t ?? '');
  return h || m ? whole((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0), 1440) : undefined;
}

const tidy = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

export function mapWbc(records: WbcRecord[]): Mapped {
  const rows: CatalogRow[] = [], skipped: string[] = [];
  const unmapped: Record<string, number> = {};
  const seen = new Set<string>();
  for (const rec of records) {
    const stem = /([A-Za-z0-9_-]{1,90})\.html$/.exec(rec.filename ?? '')?.[1];
    const d = rec.recipe_data, title = tidy(d?.title ?? '', MAX_RECIPE_NAME);
    if (!stem || !d || !title) { skipped.push(`${rec.filename ?? '?'}: no id or title`); continue; }
    const lines = d.text_lines ?? [];
    const ing = lines.filter(l => l.section === 'Ingredients' && l.line_type === 'ul').map(l => tidy(l.text ?? '', MAX_RECIPE_NAME + MAX_AMOUNT)).filter(Boolean);
    const steps = lines.filter(l => l.section === 'Procedure').map(l => tidy(l.text ?? '', MAX_STEP)).filter(Boolean);
    if (!ing.length || !steps.length) { skipped.push(`${stem}: no ingredients or no procedure`); continue; }
    if (ing.length > MAX_INGREDIENTS || steps.length > MAX_STEPS) { skipped.push(`${stem}: more than ${MAX_INGREDIENTS} ingredients or ${MAX_STEPS} steps`); continue; }
    const id = `c:wbc:${stem}`;
    if (seen.has(id)) { skipped.push(`${stem}: repeated`); continue; }
    seen.add(id);
    const cat = wbcCategory(d.infobox?.category);
    if (cat === 'other') { const k = `category:${d.infobox?.category ?? 'none'}`; unmapped[k] = (unmapped[k] ?? 0) + 1; }
    const servings = servingsOf(d.infobox?.servings), minutes = minutesOf(d.infobox?.time);
    rows.push({ id, kind: 'recipe', name: title, brand: null, data: { recipe: { cat, ing, steps, ...(servings ? { servings } : {}), ...(minutes ? { minutes } : {}) } } });
  }
  return { rows, unmapped, skipped };
}
