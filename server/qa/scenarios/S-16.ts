import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-16', feature: 'Ingredient macros', title: 'Ingredients with cup amounts are left out', persona: 'meal-planner', brief: 'recipe-ingredient-macros', edge: true,
  steps: [
    'Edit "Baked salmon" and leave its seeded amounts such as "1 cup" or "2 tbsp".',
    'Open the ingredient nutrition helper.',
  ],
  expected: [
    'Amounts in cups, spoons or pieces are not counted; the panel says how many ingredients were counted (for example "Counted 0 of 4") and names the ones left out.',
  ],
};

export default scenario;
