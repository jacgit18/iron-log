import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-64', feature: 'Weight step', title: 'Set how far an exercise goes up, and see the suggestion follow', persona: 'heavy-logger', brief: 'progression-step-per-exercise',
  steps: [
    'Open Program, Exercises and press Edit on Kneeling Cable Ab Crunch (the heavy logger logged it twice in a row at 100 lb, every set done). Its card is on Day 2 of the Board.',
    'Under Equipment, tap the 10 chip in Weight step and save. Go to the Board and find that exercise\'s card.',
    'Open the exercise again and tap the lit 10 chip once more, then save.',
  ],
  expected: [
    'The card\'s green badge reads "suggested, from N lb" with the weight 10 lb above N, not the usual 2.5 or 5.',
    'Tapping the lit chip empties the box (its placeholder reads "Default: 2.5 lb under 50 lb, else 5"); after saving, the badge goes back to the usual step. On a card with nothing logged, the Log sheet has the same field under Equipment.',
  ],
};

export default scenario;
