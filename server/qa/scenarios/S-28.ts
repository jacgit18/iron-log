import type { Scenario } from '../scenarios.ts';

// ---- Recipe auto-match ----
const scenario: Scenario = {
  id: 'S-28', feature: 'Recipe auto-match', title: 'Water counts as always at home', persona: 'recipe-collector', brief: 'recipe-auto-match',
  steps: [
    'Edit "Chicken and rice bowl" and add an ingredient "water" with amount "2 cups"; Save.',
    'Open the recipe and read the ingredient status.',
    'Press Add missing to Shopping.',
  ],
  expected: [
    'Water shows as Have with the note "Always at home" and is included in "Have x of y"; the Have, Missing and On your list marks line up in one column down the page.',
    'Add missing does not add water to the grocery list.',
  ],
};

export default scenario;
