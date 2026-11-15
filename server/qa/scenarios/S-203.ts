import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-203', feature: 'Nutrition board', title: 'Copy yesterday and Save as a meal', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'Press Add food, Copy yesterday, then Copy yesterday again. Untick one food and press Add selected.',
    'Press Back to ways of adding, then Save as a meal. Press Save as a meal, tick two foods from today, name it "Lunch two" and save.',
    'Delete every eaten food on today, then press Add food and read the list of ways.',
  ],
  expected: [
    'Only the ticked foods are added to today and appear in the eaten rows; the notice reads "Added <n>.".',
    'The meal "Lunch two" is in Recipes under Meals and in Saved meals (S-185).',
    'With nothing eaten yet the list of ways has no "Save as a meal in Recipes" row; log one food and it comes back.',
  ],
};

export default scenario;
