import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-149', feature: 'Food type', title: 'Review types: suggestions, one change, Looks right, Undo', persona: 'recipe-collector', brief: 'food-type-and-migration',
  steps: [
    'Make three ready-made foods without a Type (an older account that has them; or on a test account add them in an older build): Whole milk, Eggs large, Frozen lasagna. Open Recipes.',
    'Read the banner and press Review types. Change Frozen lasagna to Drink (its Ready to eat chip turns off), then press Looks right.',
    'Press Undo on the notice.',
  ],
  expected: [
    'The banner says "3 foods need a type." The review page lists each food with its suggestion: Whole milk Drink, Eggs large Ingredient and Ready to eat together, Frozen lasagna Ready to eat. Each row shows the Used as chips.',
    'The list shows "Food types saved." and the banner is gone.',
    'The banner returns with "3 foods need a type."; Back from the review page returns to the list, and a reload on it shows the list.',
  ],
};

export default scenario;
