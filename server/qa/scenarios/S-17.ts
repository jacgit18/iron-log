import type { Scenario } from '../scenarios.ts';

// ---- Food lookup ----
const scenario: Scenario = {
  id: 'S-17', feature: 'Food lookup', title: 'Look up a food and scale it by grams', persona: 'diet-on-target', brief: 'diet-food-lookup',
  steps: [
    'Press Add food, then Find food. In the "Search your past meals and recipes" box type "banana".',
    'Pick a result and enter 150 g.',
    'Change Protein by hand and press Add.',
  ],
  expected: [
    'Up to eight foods appear with kcal per 100 g; one letter shows nothing.',
    'Calories, Protein, Carbs and Fat fill as per-100-g x grams / 100 and stay editable before Add.',
    'If QA has no food search key you see the "not available" message instead (record that as the result).',
  ],
};

export default scenario;
