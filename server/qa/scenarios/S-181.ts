import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-181', feature: 'Goes with', title: 'After you log a food, what goes with it is one tap away', persona: 'meal-planner', brief: 'recipes-goes-with',
  steps: [
    'With Chili and Rice paired, open Chili, press Ate this, then read under the message.',
    'Press "+ Rice" and read the message. Press Undo next to Rice.',
    'Go back to Recipes, press Log on the Chili row, press Log it and read the sheet.',
  ],
  expected: [
    'A "Goes with it:" row offers + Rice. One tap logs Rice at its usual amount on the same day, and Undo takes back only the Rice entry (the Chili entry stays).',
    'The Log sheet offers the same row after Log it. A recipe with no pairing offers nothing.',
  ],
};

export default scenario;
