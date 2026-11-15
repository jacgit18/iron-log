import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-195', feature: 'Nutrition board', title: 'Today\'s meters count what was eaten and drunk', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'On Nutrition read today\'s meters: Calories, Protein, Fat, Supplements and Water.',
    'Press Add food, One-off food, add "Rice" 300 kcal, 20 g protein, 40 g carbs, 5 g fat, then Done.',
    'Press + Drink under Hydration, press the 16.9 oz size, then Done.',
  ],
  expected: [
    'Before: Calories reads "1,440 / 2,400 kcal" and Protein "58 / 160 g"; Fat is a number against 70 g; Supplements reads "n of m taken" (or "None scheduled"); Water is "0 / <goal> oz". A screen reader says "Calories eaten so far: …", and Water "drunk".',
    'After Rice: Calories reads "1,740 / 2,400 kcal", Protein "78 / 160 g", Fat 5 g higher, and Rice shows as an eaten row.',
    'After the drink: Water reads "16.9 / <goal> oz", and Hydration says how many oz are to go.',
  ],
};

export default scenario;
