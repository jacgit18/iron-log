import type { Scenario } from '../scenarios.ts';

// ---- Label scan ----
const scenario: Scenario = {
  id: 'S-49', feature: 'Label scan', title: 'Fill a ready-made food from a label photo', persona: 'diet-on-target', brief: 'label-photo-scan', device: true,
  steps: [
    'On a phone. On Recipes press + New, then Add a food, then Scan label (opens the camera) and photograph a nutrition-facts label (frozen gnocchi, cereal, a can); on a second food press Pick from photos and pick a saved photo of a label.',
    'Compare the filled calories, protein, carbs and fat with the printed per-serving column and fix anything that differs.',
    'Press Save food, open it, and use Ate this with 1.5 portions.',
  ],
  expected: [
    'The form fills in a few seconds with the name, per-serving numbers and a Note like "1 serving = 2/3 cup (55 g). About 6 servings per pack." and says to check the numbers; nothing is saved yet.',
    'After Save food the food is in the Foods list; Ate this logs 1.5 times the calories and protein to today.',
  ],
};

export default scenario;
