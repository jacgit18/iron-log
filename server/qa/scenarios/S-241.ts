import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-241', feature: 'Supplement times', title: 'Set each time and its amount in the supplement sheet', persona: 'supplement-stack', brief: 'supplement-split-times',
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'In Manage, press Edit on Fish oil. In the sheet find "When you take it". Light Noon as well, then set the amount at each time with the steppers and press Save.',
    'Open Daily, Nutrition and read Fish oil in the Supplements section.',
  ],
  expected: [
    'The sheet shows a total such as "4 softgels a day" with "Morning 2 · Night 2" and updates as chips or steppers change; a time cannot repeat and at least one stays on.',
    'After Save, each time is its own row and ticks separately; a row shows its amount (for example "2 softgels") only when the amount is not 1.',
  ],
};

export default scenario;
