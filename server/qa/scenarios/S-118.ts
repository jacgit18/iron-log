import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-118', feature: 'Program tab clarity', title: 'The pill hides while the rest timer runs; a long program name wraps', persona: 'new-user', brief: 'program-tab-clarity', edge: true,
  steps: [
    'On a phone start the Rest timer on the Board, then open Program.',
    'Stop the timer.',
    'Rename Program A to a 60 character name (Settings) and look at the header card.',
  ],
  expected: [
    'While the timer bar shows, there is no + New program pill; after Stop it comes back.',
    'The long name wraps inside the header card, the page does not scroll sideways and the A | B switch stays on screen.',
  ],
};

export default scenario;
