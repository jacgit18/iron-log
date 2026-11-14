import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-117', feature: 'Program tab clarity', title: 'On a phone the first exercise shows on the first screen and the compact top works', persona: 'superset-builder', brief: 'program-tab-clarity',
  steps: [
    'On a phone (or a 375 x 812 window) open Program with the guide dismissed.',
    'Look at the top of the editor: + Add exercise and the two small buttons under it.',
    'Press Add a day label, type a label and press Enter. Press Copy day..., choose another day and press Copy.',
    'Press + New program.',
  ],
  expected: [
    'The first exercise row is on the first screen. + Add exercise is full width, with Add a day label and Copy day... under it.',
    'The label is saved and the field then stays; Copy shows the Copied notice. + New program opens the Create a program sheet and the pill hides while it is open.',
  ],
};

export default scenario;
