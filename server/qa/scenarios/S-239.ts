import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-239', feature: 'Supplement times', title: 'One supplement row with Morning, Noon and Night chips, no duplicate list', persona: 'supplement-stack', brief: 'supplement-merged-list',
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'Open Daily, Nutrition, Manage, then Supplements and library. Find Fish oil.',
    'Press the Noon chip on Fish oil, then press it again.',
    'Press Undo on the notice that follows the second press.',
  ],
  expected: [
    'Fish oil is one row, not two, with Morning and Night lit; Creatine monohydrate, Caffeine capsule and Multivitamin are one row each. No schedule list repeats the same names under Morning, Noon and Night.',
    'The first press lights Noon and adds a copy at one serving; the second press removes that time with an Undo notice, and Undo restores it.',
  ],
};

export default scenario;
