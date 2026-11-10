import { NUTRIENT_UNITS } from './nutrientKeys.js';
import type { NutrientUnit } from './nutrientKeys.js';
import type { IngredientLimit } from '../types.ts';

/* ---------- Active ingredients on a supplement (brief supplement-active-ingredients, ADR 118) ----------
   A separate list beside the 28 nutrient rows: omega-3, creatine, caffeine or any typed name. The name is free text, so a later curated item needs one entry here and no data migration.
   There is no built-in limit for any of them: a limit is only the person's own number (`Cfg.ingredientLimits`). Framework-free, so the client and the API share it (ADR 015). */

/** The ingredients the picker offers, in the order it shows them. */
export const CURATED_INGREDIENTS = ['Omega-3', 'EPA', 'DHA', 'Creatine', 'Caffeine'] as const;
export const MAX_INGREDIENT_ROWS = 30;
export const MAX_INGREDIENT_NAME = 60;
export const MAX_INGREDIENT_AMOUNT = 1e7;
export const MAX_INGREDIENT_LIMITS = 30;

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Case and spacing folded away: what two spellings of one ingredient share ("  omega-3 " and "Omega-3"). */
export const ingredientKey = (name: unknown): string => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, MAX_INGREDIENT_NAME).toLowerCase() : '');
/** The name a row keeps: the curated spelling when the typed one matches it, else the typed name with its spacing tidied. */
export function ingredientName(name: unknown): string {
  const k = ingredientKey(name);
  if (!k) return '';
  const curated = CURATED_INGREDIENTS.find(c => c.toLowerCase() === k);
  return curated ?? (name as string).trim().replace(/\s+/g, ' ').slice(0, MAX_INGREDIENT_NAME);
}
/** A name for a key with no row to take it from (a limit set for an ingredient no supplement lists today). */
export const labelOfKey = (key: string): string => CURATED_INGREDIENTS.find(c => c.toLowerCase() === key) ?? (key ? key[0].toUpperCase() + key.slice(1) : '');
const isUnit = (u: unknown): u is NutrientUnit => (NUTRIENT_UNITS as readonly unknown[]).includes(u);
const goodAmount = (a: unknown): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0 && a <= MAX_INGREDIENT_AMOUNT;

/** What a person typed for a limit, or the words that say why it cannot be saved. Used by the limit sheet and the settings cleaner alike. */
export function checkLimit(kind: unknown, amount: unknown, unit: unknown): { limit: IngredientLimit } | { error: string } {
  if (kind !== 'target' && kind !== 'cap') return { error: 'Choose Target or Cap.' };
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return { error: 'Enter an amount above zero.' };
  if (n > MAX_INGREDIENT_AMOUNT) return { error: 'That amount is too large.' };
  if (!isUnit(unit)) return { error: 'Choose a unit.' };
  const rounded = round3(n);
  if (rounded <= 0) return { error: 'Enter an amount above zero.' }; // 0.0004 rounds to 0
  return { limit: { kind, amount: rounded, unit } };
}

/** Your limits as saved: a lowercase name, a kind, a positive amount and a known unit each; anything else is dropped. */
export function ingredientLimitsOf(x: unknown): Record<string, IngredientLimit> {
  const out: Record<string, IngredientLimit> = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  for (const [name, v] of Object.entries(x as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_INGREDIENT_LIMITS) break;
    const key = ingredientKey(name);
    if (!key || UNSAFE.has(key) || key in out || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (!goodAmount(r.amount)) continue;
    const c = checkLimit(r.kind, r.amount, r.unit);
    if ('limit' in c) out[key] = c.limit;
  }
  return out;
}

/** The unit a curated ingredient starts with in the editor (a typed name starts in mg). */
export const defaultIngredientUnit = (name: string): NutrientUnit => (ingredientKey(name) === 'creatine' ? 'g' : 'mg');
