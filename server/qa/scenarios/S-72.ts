import type { Scenario } from '../scenarios.ts';

// ---- Program on phones ----
const scenario: Scenario = {
  id: 'S-72', feature: 'Program on phones', title: 'The header card has the A and B switch and no Create button; + New program floats above the tab bar', persona: 'new-user', brief: 'program-tab-clarity',
  steps: [
    'On a phone (or a 375 px wide window), open the Program tab.',
    'Look at the card under the three section buttons, and at the bottom right corner.',
  ],
  expected: [
    'The card says "You are editing" and the program name, with the switch showing only Program A and Program B (no other labels), and it does not scroll sideways.',
    'There is no Create a program button in the card; a gold + New program pill floats at the bottom right above the tab bar.',
  ],
};

export default scenario;
