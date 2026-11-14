import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-262', feature: 'Supplement UPC', title: 'Scan a bottle label when the product is not in NIH', persona: 'diet-fresh', brief: 'supplement-label-scan', device: true,
  steps: [
    'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
    'On a phone, press + Add, type a name the catalog lacks, press "Scan the bottle’s label" and photograph a label; read "Uses AI · N of 5 left today".',
  ],
  expected: [
    'The label is read into vitamin, mineral and ingredient rows to review before saving; the allowance line counts down (5 a day per person); at the cap it says so. On a typed supplement, "Scan label" shows the label beside its rows and "Replace with label amounts" changes the form only; nothing saves until Save.',
  ],
};

export default scenario;
