import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-182', feature: 'Goes with', title: 'A recipe goes with at most three, and a sauce is not offered', persona: 'recipe-collector', brief: 'recipes-goes-with', edge: true,
  steps: [
    'Open a recipe and add three recipes in Goes with. Look for a fourth. (This account already has Chicken and rice bowl and Baked salmon each going with Tuna salad: open Tuna salad and read its Goes with first.)',
    'Press Remove on one (then Tap again to remove) and add a different one. Make a recipe in + New with the category Sauces (this account has none), then open another recipe and look at its Goes with choices.',
  ],
  expected: [
    'After three, the drop-down is gone and the note says "It goes with 3 recipes. Remove one to add another."',
    'Removing one brings the drop-down back. Sauces and seasonings are not offered as partners.',
  ],
};

export default scenario;
