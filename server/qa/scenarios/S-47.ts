import type { Scenario } from '../scenarios.ts';

// ---- kg beside lb ----
const scenario: Scenario = {
  id: 'S-47', feature: 'kg beside lb', title: 'See the kg beside a pound weight', persona: 'heavy-logger', brief: 'lb-kg-toggle',
  steps: [
    'On the Board press Log on an exercise and type 135 in Set 1 weight.',
    'Fill the reps, press Save set, then open the Log sheet again and look at Recent.',
  ],
  expected: [
    'A small grey "61.2 kg" shows right of the weight box as you type, and nothing shows when the box is empty.',
    'The Recent list shows the load as "135 lb (61.2 kg)". The saved weight is still 135 lb.',
  ],
};

export default scenario;
