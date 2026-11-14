import type { Scenario } from '../scenarios.ts';

// ---- Recipe-first log ----
const scenario: Scenario = {
  id: 'S-19', feature: 'Recipe-first log', title: 'Ate this on a recipe, for a chosen day', persona: 'meal-planner', brief: 'recipe-first-diet-log',
  steps: [
    'Open Recipes, then a recipe with calories and protein (for example Overnight oats).',
    'Press Ate this, choose yesterday in the Day field and confirm.',
    'Press Undo. Then try a day 401 days back and a day in the future.',
  ],
  expected: [
    'One entry with the recipe\'s numbers and its recipe link is added to the chosen day; Undo removes only that entry.',
    'A future day ("Pick today or an earlier day.") and a day over 400 days back are refused; the app keeps 400 days of diet history.',
  ],
};

export default scenario;
