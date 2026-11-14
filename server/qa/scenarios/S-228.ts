import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-228', feature: 'Food vitamins and minerals', title: 'A food found by name carries its vitamins and minerals into the log', persona: 'diet-fresh', brief: 'food-vitamins-minerals',
  steps: [
    'Press Add food, then Find food. Type "spinach", pick the first result, set 100 g and press Use.',
    'Read the form that opens, press Add, then close the sheet and open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) on today.',
  ],
  expected: [
    'The One-off form opens with "Vitamins and minerals (optional)" already open and rows filled by the lookup (for example Calcium, Iron, Potassium), each in mg, mcg or g, with "Filled from the food lookup or an earlier save. Check them against the label; change or remove any row."',
    'After Add, today shows a Vitamins and minerals line (or, with no such line, a Totals button). Totals says "Food: 1 of 1 eaten food had vitamin or mineral data." and the rows show the amounts for 100 g.',
  ],
};

export default scenario;
