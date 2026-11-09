/* ---------- Which nutrients a supplement can list ----------
   The keys, units and caps the supplement normaliser accepts (the client and the API share them, ADR 015).
   The upper limits and their sources are in `src/lib/nutrientLimits.ts`; a key here needs a row there (its test checks). */

export const NUTRIENT_KEYS = [
  'calcium', 'copper', 'folate', 'iodine', 'iron', 'magnesium', 'niacin', 'phosphorus', 'selenium',
  'vitaminA', 'vitaminB6', 'vitaminC', 'vitaminD', 'vitaminE', 'zinc',
] as const;
export type NutrientKey = typeof NUTRIENT_KEYS[number];

export const NUTRIENT_UNITS = ['g', 'IU', 'mcg', 'mg'] as const;
export type NutrientUnit = typeof NUTRIENT_UNITS[number];

/** Most rows one supplement can carry (one per nutrient and unit is plenty; this stops a runaway document). */
export const MAX_NUTRIENT_ROWS = 30;
