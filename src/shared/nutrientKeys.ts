/* ---------- Which nutrients a supplement can list ----------
   The keys, units and caps the supplement normaliser accepts (the client and the API share them, ADR 015).
   Two kinds: the nutrients with an adult upper limit (`LIMIT_KEYS`, rows in `src/lib/nutrientLimits.ts`) and the ones without (`TARGET_KEYS`, rows in `src/lib/nutrientTargets.ts`:
   a recommended amount, never a limit; brief nutrients-without-upper-limit). A key here needs a row in exactly one of them (`nutrientTargets.test.ts` checks). */

export const LIMIT_KEYS = [
  'calcium', 'choline', 'copper', 'folate', 'iodine', 'iron', 'magnesium', 'manganese', 'molybdenum', 'niacin', 'phosphorus', 'selenium',
  'vitaminA', 'vitaminB6', 'vitaminC', 'vitaminD', 'vitaminE', 'zinc',
] as const;
export const TARGET_KEYS = [
  'potassium', 'vitaminB12', 'vitaminK', 'fiber', 'sodium',
  // brief supplement-more-nutrients: one key per line, so parallel branches merge
  'biotin',
  'chromium',
  'pantothenicAcid',
  'riboflavin',
  'thiamin',
] as const;
/** Limit keys first, in the limits table's order, then the target keys: a cleaned `micro` writes its keys in this order. */
export const NUTRIENT_KEYS = [...LIMIT_KEYS, ...TARGET_KEYS] as const;
export type NutrientKey = typeof NUTRIENT_KEYS[number];
export type LimitKey = typeof LIMIT_KEYS[number];
export type TargetKey = typeof TARGET_KEYS[number];

export const NUTRIENT_UNITS = ['g', 'IU', 'mcg', 'mg'] as const;
export type NutrientUnit = typeof NUTRIENT_UNITS[number];

/** Most rows one supplement can carry (one per nutrient and unit is plenty; this stops a runaway document). */
export const MAX_NUTRIENT_ROWS = 30;
