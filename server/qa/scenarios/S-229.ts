import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-229', feature: 'Food vitamins and minerals', title: 'A scanned barcode logs the food with its vitamins and minerals', persona: 'diet-fresh', brief: 'food-vitamins-minerals', device: true,
  steps: [
    'On a phone, press Add food, then Find food, press Scan to fill form and scan a packaged food with a nutrition panel (a cereal box works).',
    'Check the amounts in the form against the box (Sodium and Fiber are the ones Open Food Facts lists most often), then press Add.',
  ],
  expected: [
    'The food is found and the form shows "Vitamins and minerals (optional)" with rows that match the box for the serving you chose. A product that lists none shows no rows and counts as a food with no data.',
    'After Add, Totals counts the food and the coverage line says 1 of 1.',
  ],
};

export default scenario;
