import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-152', feature: 'Recipes find', title: 'List beside its detail on a wide screen, a page on a phone', persona: 'recipe-collector', brief: 'recipes-find-type-tabs',
  steps: [
    'On a desktop browser 1280 px wide or more open Recipes and press three different rows.',
    'Narrow the window to a phone width (or open the app on a phone) and press a row, then press Back.',
  ],
  expected: [
    'The list stays on the left and the pressed recipe shows on the right, in place, with no Back bar.',
    'The recipe opens as its own page and Back returns to the list.',
  ],
};

export default scenario;
