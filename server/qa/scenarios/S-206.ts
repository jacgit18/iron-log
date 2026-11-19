import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-206', feature: 'Nutrition board', title: 'A day with nothing says so in every section', persona: 'diet-fresh', brief: 'nutrition-board', edge: true,
  steps: [
    'On Nutrition read today\'s column from top to bottom. This account has never logged a food or set a supplement.',
    'Press Add food and Quick add.',
  ],
  expected: [
    'Breakfast, Lunch and Dinner each say "Nothing planned" with no button; Snack sits after Dinner and says "No daily snacks yet" with a Set up daily snacks button. a day with nothing logged shows no Not in a meal group; Supplements says "Nothing scheduled"; Hydration shows how many oz are to go and a + Drink button.',
    'Quick add says "Nothing here yet. Log a few foods and the ones you use most appear."',
  ],
};

export default scenario;
