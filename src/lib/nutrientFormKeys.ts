import type { NutrientKey } from '../shared/nutrientKeys.js';

/* The nutrients the two form pickers (supplement rows, food amount rows) offer. NUTRIENT_KEYS holds 28; the pickers keep offering the first 20 until the grouped pickers ship (brief
   supplement-more-nutrients, PR 2), so a row cannot be added for a nutrient the form was not designed for. Totals, label imports and scans already read all 28. PR 2 deletes this file. */
export const FORM_KEYS: readonly NutrientKey[] = [
  'calcium', 'copper', 'folate', 'iodine', 'iron', 'magnesium', 'niacin', 'phosphorus', 'selenium',
  'vitaminA', 'vitaminB6', 'vitaminC', 'vitaminD', 'vitaminE', 'zinc',
  'potassium', 'vitaminB12', 'vitaminK', 'fiber', 'sodium',
];
