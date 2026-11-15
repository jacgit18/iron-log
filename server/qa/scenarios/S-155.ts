import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-155', feature: 'Nutrition quick log', title: 'Scan a food from Quick add: pick its Type and it is saved and logged once', persona: 'diet-fresh', brief: 'nutrition-quick-log',
  steps: [
    'On the Nutrition tab press Scan and log in the toolbar, scan a packaged product (or use the photo of a barcode), press Drink, set the grams and press Save and log it. Then open Recipes.',
  ],
  expected: [
    'The food shows once in the day\'s eaten rows and once in Recipes as a Drink, and one entry is logged however many times Save and log it was tapped. Scanning on a phone needs a camera: try it on a real phone.',
  ],
};

export default scenario;
