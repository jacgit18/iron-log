import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-103', feature: 'Moved-card tag', title: 'A card moved to another day is tagged with the day it came from', persona: 'superset-builder', brief: 'moved-from-label',
  steps: [
    'Open the Board and open the ⋯ menu on a card that sits on Day 2.',
    'In Move to choose Day 4. Find the card in the Day 4 column and read its tag.',
    'Move it back to Day 2 (Day 2 shows "(planned)") and look for the tag.',
  ],
  expected: [
    'On Day 4 the card carries the tag "From Day 2".',
    'Back on its planned day the tag is gone.',
  ],
};

export default scenario;
