import type { Scenario } from '../scenarios.ts';

// ---- Whole pack ----
const scenario: Scenario = {
  id: 'S-51', feature: 'Whole pack', title: 'Log a whole pack of a ready-made food', persona: 'diet-on-target', brief: 'whole-pack',
  steps: [
    'On Recipes press + New, then Add a food, type a name, 210 calories and 6 protein, set Servings per pack to 12 and press Save food.',
    'Open the food, look under Per portion, then press Whole pack (12) and press More once.',
    'Press Whole pack (12) again, press Ate this, then press Undo.',
  ],
  expected: [
    'The page says "12 servings per pack"; Whole pack (12) sets the stepper to 12 portions and More is disabled at 12.',
    'Ate this logs "12 portions" with 2,520 calories to today; Undo removes it. A food saved with no pack size has no Whole pack button and its stepper stops at 10.',
  ],
};

export default scenario;
