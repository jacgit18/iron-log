import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-88', feature: 'Barcode scan', title: 'A store-brand frozen food (Aldi, Trader Joe\'s) is found in Open Food Facts', persona: 'diet-on-target', brief: 'barcode-coverage', device: true,
  steps: [
    'On a phone. On Recipes press + New, then Add a food, then Scan to fill form and point the camera at an Aldi or Trader Joe\'s frozen food (the ones USDA did not know in S-74).',
    'When the sheet closes, read the product name, its calories per 100 g and the line under it.',
    'Press Use, compare the calories, protein, carbs and fat with the printed label, and press Save food only if you want it.',
    'Scan a product USDA does know (oatmeal) and read the same place.',
  ],
  expected: [
    'The product is found; under it the line "Data from Open Food Facts. Crowd-sourced: check the numbers against the label." shows, and the grams start at the product\'s serving when it has one.',
    'Use fills the form with that serving\'s numbers (editable); nothing is saved until Save food. A number that disagrees with the label is yours to correct before saving.',
    'The USDA product shows no Open Food Facts line.',
  ],
};

export default scenario;
