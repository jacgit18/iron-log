import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-204', feature: 'Nutrition board', title: 'Scan from Find food and come back to the same sheet', persona: 'diet-on-target', brief: 'nutrition-board', device: true,
  steps: [
    'On a phone open Nutrition, press Add food, Find food and Scan to fill form, and allow the camera.',
    'Scan a packaged US food until the camera sheet closes.',
    'Read the sheet that comes back, press Use, check the One-off food form and press Add.',
    'Scan a code neither source knows and read the buttons after the miss.',
  ],
  expected: [
    'The camera sheet closes and the Add food sheet should come back on Find food with the product picked (name, calories per 100 g, grams at its serving); you should not have to open the add sheet again. (Expected from the code; not yet walked on a phone, so record what you see.)',
    'Use fills the One-off food form; Add says "Added <name>." and the food is in today\'s eaten rows and meters.',
    'After a miss, Type the name and Photo the label are offered, as in S-93.',
  ],
};

export default scenario;
