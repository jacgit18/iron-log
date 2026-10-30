// Food search (brief diet-food-lookup): turns USDA FoodData Central search results into the few numbers a diet entry needs, and scales
// them to the grams eaten. Pure, shared by the server (which asks USDA) and the app (which scales a pick). Nothing here is stored.

export const MIN_QUERY = 2;
export const MAX_QUERY = 60;
export const MAX_RESULTS = 8;
export const MAX_GRAMS = 5000;

/** One search result: numbers per 100 g, `c` and `f` left out when the source has none. `serving` is a branded food's own serving in grams. */
export interface FoodHit { id: number; name: string; brand?: string; kcal: number; p: number; c?: number; f?: number; serving?: number }

/** What the person typed, trimmed and squeezed; null when it is too short or too long to ask about. */
export function cleanQuery(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const q = v.replace(/\s+/g, ' ').trim();
  return q.length >= MIN_QUERY && q.length <= MAX_QUERY ? q : null;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

// USDA nutrient numbers: 208 energy (kcal), 203 protein, 205 carbohydrate by difference, 204 total fat. Foundation foods may give energy only as 958 or 957 (Atwater).
const ENERGY = ['208', '958', '957'];

/** The amounts by nutrient number. A food-nutrient row names its number `nutrientNumber` and its amount `value` (search) or `number` and `amount` (abridged); both are read. */
function amounts(list: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const o = obj(item);
    if (!o) continue;
    const n = o.nutrientNumber ?? o.number;
    const a = num(o.value ?? o.amount);
    if ((typeof n === 'string' || typeof n === 'number') && a !== null) out.set(String(n), a);
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The foods in a USDA search answer that have calories and protein, at most `MAX_RESULTS`, in the source's order. Anything unreadable is skipped, never thrown. */
export function parseFoods(json: unknown): FoodHit[] {
  const foods = obj(json)?.foods;
  if (!Array.isArray(foods)) return [];
  const out: FoodHit[] = [];
  for (const raw of foods) {
    const o = obj(raw);
    if (!o) continue;
    const id = o.fdcId;
    const name = typeof o.description === 'string' ? o.description.trim() : '';
    if (typeof id !== 'number' || !Number.isInteger(id) || !name) continue;
    const a = amounts(o.foodNutrients);
    const kcal = ENERGY.map(k => a.get(k)).find(v => v !== undefined);
    const p = a.get('203');
    if (kcal === undefined || p === undefined || kcal <= 0) continue;
    const c = a.get('205'), f = a.get('204');
    const brand = typeof o.brandName === 'string' && o.brandName.trim() ? o.brandName.trim() : typeof o.brandOwner === 'string' && o.brandOwner.trim() ? o.brandOwner.trim() : undefined;
    const unit = typeof o.servingSizeUnit === 'string' ? o.servingSizeUnit.toLowerCase() : '';
    const size = num(o.servingSize);
    const serving = size !== null && size > 0 && size <= MAX_GRAMS && (unit === 'g' || unit === 'grm') ? round1(size) : undefined;
    out.push({ id, name: name.slice(0, 80), ...(brand ? { brand: brand.slice(0, 60) } : {}), kcal: Math.round(kcal), p: round1(p), ...(c !== undefined ? { c: round1(c) } : {}), ...(f !== undefined ? { f: round1(f) } : {}), ...(serving !== undefined ? { serving } : {}) });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

/** A hit read back from our own route, checked again before it reaches a form (the answer crosses the network). */
export function cleanHits(json: unknown): FoodHit[] {
  const hits = obj(json)?.hits;
  if (!Array.isArray(hits)) return [];
  const out: FoodHit[] = [];
  for (const raw of hits) {
    const o = obj(raw);
    if (!o || typeof o.id !== 'number' || typeof o.name !== 'string' || !o.name) continue;
    const kcal = num(o.kcal), p = num(o.p);
    if (kcal === null || p === null) continue;
    const c = num(o.c), f = num(o.f), serving = num(o.serving);
    out.push({ id: o.id, name: o.name.slice(0, 80), ...(typeof o.brand === 'string' && o.brand ? { brand: o.brand.slice(0, 60) } : {}), kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...(serving !== null && serving > 0 ? { serving } : {}) });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

/** Grams as typed: a number above 0 up to `MAX_GRAMS`; null otherwise. */
export function cleanGrams(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= MAX_GRAMS ? n : null;
}

/** The form's numbers for `grams` of a food: calories whole, grams to one decimal, carbs and fat left out when the source has none. */
export function scaleFood(hit: FoodHit, grams: number): { kcal: number; p: number; c?: number; f?: number } {
  const k = grams / 100;
  return { kcal: Math.round(hit.kcal * k), p: round1(hit.p * k), ...(hit.c !== undefined ? { c: round1(hit.c * k) } : {}), ...(hit.f !== undefined ? { f: round1(hit.f * k) } : {}) };
}

/** The grams a pick starts at: a branded food's serving, else 100. */
export const defaultGrams = (hit: FoodHit): number => hit.serving ?? 100;

/** The label on a result: "Chicken breast · 120 kcal per 100 g" (the brand after the name when there is one). */
export const hitLabel = (hit: FoodHit): string => `${hit.name}${hit.brand ? ` (${hit.brand})` : ''} · ${hit.kcal} kcal per 100 g`;
