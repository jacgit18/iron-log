import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-259', feature: 'Supplement add sheet', title: 'One add sheet with one search over your supplements and the catalog', persona: 'diet-fresh', brief: 'supplement-add-redesign',
  steps: [
    'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
    'Open Daily, Nutrition, Manage, then Supplements and library and press + Add. Type "fish oil" in the search.',
    'Pick a catalog result and read the amounts shown, then choose a time of day and a dose.',
  ],
  expected: [
    'One search lists your own supplements and the catalog together, each result showing brand, form and label year.',
    'The picked product shows its UPC and label amounts inline. (The "Open the full form, with amounts" link shows before a pick or for a typed name, not after a catalog pick.)',
  ],
};

export default scenario;
