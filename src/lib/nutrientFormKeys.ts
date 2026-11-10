import { NUTRIENT_KEYS, type NutrientKey } from '../shared/nutrientKeys.js';

/* The nutrients the two form pickers (supplement rows, food amount rows) offer. NUTRIENT_KEYS holds 28; the pickers keep offering the 20 that existed before the eight added ones until the grouped
   pickers ship (brief supplement-more-nutrients, PR 2), so a row cannot be added for a nutrient the form was not designed for. Totals, label imports and scans already read all 28. PR 2 deletes this file. */
const ADDED: readonly NutrientKey[] = ['biotin', 'chromium', 'choline', 'manganese', 'molybdenum', 'pantothenicAcid', 'riboflavin', 'thiamin'];
export const FORM_KEYS: readonly NutrientKey[] = NUTRIENT_KEYS.filter(k => !ADDED.includes(k));
