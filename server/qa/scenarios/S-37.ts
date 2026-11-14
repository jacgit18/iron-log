import type { Scenario } from '../scenarios.ts';

// ---- Wide layouts ----
const scenario: Scenario = {
  id: 'S-37', feature: 'Wide layouts', title: 'Board fits a 1920 px screen', persona: 'heavy-logger', brief: 'board-columns-fit-wide',
  steps: [
    'Open the Board in a 1920 x 1080 window.',
    'Narrow the window to 1280 px.',
  ],
  expected: [
    'At 1920 px all seven day columns fit with no sideways scroll.',
    'At 1280 px the Board scrolls sideways again with its usual column width.',
  ],
};

export default scenario;
