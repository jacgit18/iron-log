import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-116', feature: 'Program tab clarity', title: 'Saved programs: save a copy, edit it, put it on the Board', persona: 'superset-builder', brief: 'program-tab-clarity',
  steps: [
    'On Program, scroll to Saved programs and read its text.',
    'Save Program A as "Kept copy" with Save a copy, then switch the card to Program B.',
    'Press Put on Board on Kept copy, read the button, press it again.',
  ],
  expected: [
    'The panel is called Saved programs (not Program library) and says what saving and putting on the Board do.',
    'The first press changes nothing and the button asks "Tap to replace Program B"; the second makes the card say Kept copy. Edit, Archive, Delete and Compare programs still work.',
  ],
};

export default scenario;
