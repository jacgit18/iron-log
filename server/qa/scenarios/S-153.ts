import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-153', feature: 'Recipes find', title: '+ New menu and the Recent and favorites row', persona: 'recipe-collector', brief: 'recipes-find-type-tabs',
  steps: [
    'Open Recipes and press + New. Read the choices, then press Recipe or meal and go Back. Press the Library pill beside All and Mine, then press Mine again. Press + New, then Scan to fill a food form.',
    'After starring two recipes (S-173 walks the star), reload the page and press the Recent pill (the first pill of the type row, with a star).',
  ],
  expected: [
    'The menu lists three rows: Recipe or meal, Scan to fill a food form and Add a food by hand (the Library is a source pill beside All and Mine, not a menu row); each opens its own flow, and Scan to fill a food form opens the New food form with the barcode sheet on top.',
    'Recent turns on and the list shows the starred recipes first; pressing a row opens that recipe.',
    'After a reload with no stars and nothing logged or opened since, the Recent pill is not shown (a recipe opened in the same visit still counts as recent).',
  ],
};

export default scenario;
