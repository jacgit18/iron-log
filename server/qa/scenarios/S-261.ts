import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-261', feature: 'Supplement UPC', title: 'Type a UPC and the product fills the add sheet search', persona: 'diet-fresh', brief: 'supplement-barcode-search',
  steps: [
    'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
    'In the add sheet type the UPC of a Thorne or Sports Research bottle you have (it is found only if the crawl stored it), then type a number that is on no label.',
  ],
  expected: [
    'A stored UPC fills the search with the product name and its exact catalog listing; an unknown number says it was not found and offers the label scan.',
  ],
};

export default scenario;
