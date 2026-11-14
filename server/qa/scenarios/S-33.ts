import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-33', feature: 'Account menu', title: 'The account menu on a phone width', persona: 'new-user', brief: 'feature-map', edge: true,
  steps: [
    'Emulate a 375 px wide window and open the account menu.',
    'Tap outside it.',
  ],
  expected: [
    'The menu is a bottom sheet with the same rows; tapping outside closes it.',
  ],
};

export default scenario;
