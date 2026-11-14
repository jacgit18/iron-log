import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-38', feature: 'Wide layouts', title: 'Settings in two columns', persona: 'new-user', brief: 'settings-two-columns',
  steps: [
    'Open Settings at 1920 px, then 1280 px, then 1279 px, then 375 px.',
    'At 1920 px use a rail jump link.',
  ],
  expected: [
    'From 1280 px Data and App sit beside Training; below that it is one column in the same order.',
    'The jump link scrolls to the right group; no sideways scroll at any width.',
  ],
};

export default scenario;
