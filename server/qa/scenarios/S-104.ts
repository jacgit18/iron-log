import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-104', feature: 'Moved-card tag', title: 'A moved card whose home day is off the board names its program day', persona: 'superset-builder', brief: 'moved-from-label', edge: true,
  steps: [
    'Superset builder has no Day 7 workout, so make one first: in Program, open Day 6, use "Copy this day to" Day 7 and press Copy.',
    'Open the ⋯ menu on a card from the Day 7 workout and move it to Day 3; its tag says "From Day 7".',
    'Tick Rest on Day 6, so every workout from Day 6 on slips one column later and the Day 7 workout\'s home column is past the end of the board (if the page asks to confirm, read it and press OK).',
    'Read the tag on the card you moved. Untick Rest on Day 6 and read it again.',
  ],
  expected: [
    'With the rest day on, the tag reads "From Day 7’s workout, off this week" (the program day, not a column number that does not exist).',
    'With the rest day off, the tag is back to "From Day 7".',
  ],
};

export default scenario;
