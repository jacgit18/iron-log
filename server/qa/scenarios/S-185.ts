import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-185', feature: 'Saved meals move', title: 'Save as meal makes a Recipes meal, and a name a recipe has is refused', persona: 'diet-on-target', brief: 'saved-meals-into-recipes', edge: true,
  steps: [
    'Open Nutrition, press Add food, then Save as a meal. Press Save as a meal, tick Oatmeal with berries and Greek yogurt, name it "Breakfast" and save.',
    'Open Recipes, press Meals and find it. Then save another meal named "breakfast".',
  ],
  expected: [
    'A meal Breakfast is in Recipes under Meals and in Saved meals, with the two foods\' total (1 food · their calories).',
    'The second save is refused with "You already have a recipe or meal with that name."',
  ],
};

export default scenario;
