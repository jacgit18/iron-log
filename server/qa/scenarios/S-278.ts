import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-278', feature: 'Week to Shopping', title: 'Undo takes back only what the tap added', persona: 'meal-planner', brief: 'week-shopping',
  steps: [
    'With a few Shopping items of your own and two planned recipes with missing ingredients, press Add missing to Shopping.',
    'Press Undo on the notice, check Shopping, then press Add missing to Shopping again.',
  ],
  expected: [
    'After Undo Shopping holds exactly the items it had before the tap, including yours, and the notice says Removed from Shopping.',
    'The second tap adds the same items again.',
  ],
};

export default scenario;
