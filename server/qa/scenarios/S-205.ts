import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-205', feature: 'Nutrition board', title: 'Scan and log in the toolbar, save the food and log it once', persona: 'diet-fresh', brief: 'nutrition-board', device: true,
  steps: [
    'On a phone open Nutrition and press Scan and log in the toolbar (it is shown for today only).',
    'Scan a packaged product, pick its Type, set the grams and press Save and log it.',
    'Press Save and log it again if the button is still there, then open Recipes.',
  ],
  expected: [
    'The camera opens straight away, without the add sheet. A panel for the found product appears under the toolbar.',
    'The food is in today\'s eaten rows once and in Recipes once, and the meters moved once (S-155).',
  ],
};

export default scenario;
