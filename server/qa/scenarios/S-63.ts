import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-63', feature: 'Finished group', title: 'A superset and a day with nothing left', persona: 'superset-builder', brief: 'finished-group-fold', edge: true,
  steps: [
    'Tick both halves of a superset, then finish every other card in the day (tick or skip).',
    'Open the Finished bar and Untick one half of the superset.',
  ],
  expected: [
    'The superset shows as two rows in the bar, one per exercise. With every card finished the day shows its header and the closed bar, with no extra text between them.',
    'Only that half goes back; the superset returns to the open list with the other half still ticked.',
  ],
};

export default scenario;
