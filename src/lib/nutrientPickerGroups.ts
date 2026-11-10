import type { NutrientKey } from '../shared/nutrientKeys.js';

/* The heading each nutrient sits under in the two form pickers (supplement rows, food amount rows; brief supplement-more-nutrients). One table, so a new nutrient key cannot be left out of a picker:
   `nutrientPickerGroups.test.ts` fails when a key has no heading or has two. The data order of NUTRIENT_KEYS is unchanged; only the picker's display order follows this table. */
export type PickerGroup = { heading: string; keys: readonly NutrientKey[] };

export const PICKER_GROUPS: readonly PickerGroup[] = [
  { heading: 'Vitamins', keys: ['thiamin', 'riboflavin', 'niacin', 'pantothenicAcid', 'vitaminB6', 'vitaminB12', 'biotin', 'folate', 'vitaminC', 'vitaminA', 'vitaminD', 'vitaminE', 'vitaminK'] },
  { heading: 'Minerals', keys: ['calcium', 'chromium', 'copper', 'iodine', 'iron', 'magnesium', 'manganese', 'molybdenum', 'phosphorus', 'potassium', 'selenium', 'sodium', 'zinc'] },
  { heading: 'Other', keys: ['choline', 'fiber'] },
];

/** The first nutrient without a row, in the order the picker lists them, for "+ Add a nutrient". */
export const nextFreePickerKey = (taken: readonly NutrientKey[]): NutrientKey | undefined => PICKER_GROUPS.flatMap(g => g.keys).find(k => !taken.includes(k));
