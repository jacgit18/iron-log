import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-06', feature: 'Saved meals', title: 'Save today\'s foods as a meal; a name a recipe has is refused', persona: 'diet-on-target', brief: 'diet-saved-meals', edge: true,
  steps: [
    'Open Nutrition, press Add food, then Save as a meal. Press Save as a meal, tick Oatmeal with berries and Greek yogurt and save them as "Breakfast".',
    'Tick the same two foods again and save as "breakfast" (small b).',
    'Try saving with a blank name.',
  ],
  expected: [
    'A meal "Breakfast" is made in Recipes (Meals) and appears in Saved meals as one food with the two foods\' summed calories.',
    'The second save is refused ("You already have a recipe or meal with that name."); it no longer replaces.',
    'A blank name is refused.',
  ],
};

export default scenario;
