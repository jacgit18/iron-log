import type { Scenario } from '../scenarios.ts';

// ---- The Recipes and Nutrition redesign, 2026-11-08 ----
const scenario: Scenario = {
  id: 'S-173', feature: 'Recipe star', title: 'The star is in the recipe\'s own header, and a starred row shows a small mark', persona: 'recipe-collector', brief: 'recipe-star-placement',
  steps: [
    'Open Recipes and open any recipe. Look at the top of its page and press the Star button.',
    'Press Back and find that recipe in the list. Reload the page, then open the recipe again and press Unstar.',
    'Open Recipes, press Library and open a Library recipe.',
  ],
  expected: [
    'The Star button sits beside the recipe name in the page header and its name changes to Unstar when pressed.',
    'The row shows a small filled star after the name, which is not a button and does not cover Log or the at-home count. It is still there after the reload, and gone after Unstar.',
    'A Library recipe page has no Star button (it is not in Mine yet).',
  ],
};

export default scenario;
