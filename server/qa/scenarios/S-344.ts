import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-344', feature: 'Joined week and day tabs', title: 'Board on a phone: Body weight is saved and edited from inside the card, and a typed number survives a rotation', persona: 'heavy-logger', brief: 'board-card-filters-weight', edge: true,
  steps: [
    'On a phone (375 px wide) open Board, press Next week so Body weight has no entry yet, type a weight in the Body weight box in the card, and press Save.',
    'Press Edit on the same row, change the number but do not save, then rotate the phone to landscape (or widen the window past 700 px) and back.',
    'Press Save.',
  ],
  expected: [
    'After Save the row inside the card shows the weight as "<number> lb" with an Edit button, under the day tabs.',
    'The half-typed number is still in the box after turning the phone and back; no second Body weight row appears anywhere on the Board.',
    'The new number replaces the old one in the same row.',
  ],
};

export default scenario;
