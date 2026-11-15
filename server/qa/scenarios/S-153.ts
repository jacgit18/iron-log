import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-153', feature: 'Recipes find', title: '+ New menu and the Recent and favorites row', persona: 'recipe-collector', brief: 'recipes-find-type-tabs',
  steps: [
    'Open Recipes and press + New. Read the choices, then press Recipe or meal and go Back. Press the Library pill beside Mine, then press Mine again. Press + New, then Scan to fill a food form.',
    'After starring two recipes (S-173 walks the star), reload the page and press a starred chip above the list.',
  ],
  expected: [
    'The menu lists three rows: Recipe or meal, Scan to fill a food form and Add a food by hand (the Library is the pill beside Mine, not a menu row); each opens its own flow, and Scan to fill a food form opens the New food form with the barcode sheet on top.',
    'The chips above the list show the starred recipes first and open the one pressed.',
    'After a reload with no stars and nothing logged or opened since, the row is not shown (a recipe opened in the same visit still counts as recent).',
  ],
};

export default scenario;
