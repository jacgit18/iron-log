import type { Scenario } from '../scenarios.ts';

// ---- Account menu ----
const scenario: Scenario = {
  id: 'S-32', feature: 'Account menu', title: 'Open the account menu and jump to a Settings group', persona: 'new-user', brief: 'feature-map',
  steps: [
    'Press the account badge (your initial, top right) to open the account menu.',
    'Tap one of the Settings rows.',
    'Open the menu again and press Escape.',
  ],
  expected: [
    'The menu lists the Settings groups and Sign out; a row opens Settings at that group.',
    'Escape closes the menu and returns focus to the badge.',
  ],
};

export default scenario;
