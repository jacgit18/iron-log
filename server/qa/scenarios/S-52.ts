import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-52', feature: 'Whole pack', title: 'A wrong pack size is refused', persona: 'diet-fresh', brief: 'whole-pack', edge: true,
  steps: [
    'On the New food form fill the name and numbers and type 2.5 in Servings per pack, then press Save food.',
    'Change it to 8, save, then edit the food and clear the box.',
  ],
  expected: [
    'It says "Servings per pack must be a whole number from 1 to 99." and saves nothing.',
    'With 8 the page shows "8 servings per pack"; after clearing the box the line and the Whole pack button are gone.',
  ],
};

export default scenario;
