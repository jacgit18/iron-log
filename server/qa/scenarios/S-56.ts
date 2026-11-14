import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-56', feature: 'Usual amount', title: 'An odd plural, and a wrong amount is refused', persona: 'diet-fresh', brief: 'usual-amount-and-unit', edge: true,
  steps: [
    'Make a ready-made food Bread with Usual amount 2, One serving is called loaf and Plural loaves; open it and press Less twice.',
    'Edit it and type 2.3 in Usual amount, then 4 eggs in One serving is called, pressing Save food each time.',
    'Clear all three boxes, save, and open the food again.',
  ],
  expected: [
    'The stepper reads "2 loaves", then "1.5 loaves", then "1 loaf".',
    'Saving 2.3 says the amount must be from 0.5 to 99 in half steps; "4 eggs" as a unit says it must be 1 to 20 letters; with all three boxes cleared the food opens at "1 portion" again.',
  ],
};

export default scenario;
