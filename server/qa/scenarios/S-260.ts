import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-260', feature: 'Supplement label lookup', title: 'A catalog supplement arrives with its vitamins, minerals and ingredient rows', persona: 'diet-fresh', brief: 'supplement-label-amounts',
  steps: [
    'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
    'Pick a catalog fish oil in the add sheet (it needs the NIH database to answer from QA) and read the label preview before pressing Add.',
  ],
  expected: [
    'The sheet shows "In one serving" with its vitamin and mineral rows and "Also on the label" for the rest; omega-3, EPA and DHA (and creatine or caffeine on those labels) are saved as ingredient rows, not listed under Also on the label.',
    'If NIH does not answer, the add still works: the sheet says it could not load the product\'s amounts (with Try again) and you can type them.',
  ],
};

export default scenario;
