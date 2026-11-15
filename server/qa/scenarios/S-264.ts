import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-264', feature: 'Backup coverage', title: 'A backup keeps recipes and supplements and says what Replace does', persona: 'recipe-collector', brief: 'backup-coverage-followups',
  steps: [
    'Press Reset on Recipe collector first (switch to another account to do it), then switch back.',
    'In Settings, Data, export a backup, then open the import review for that file.',
  ],
  expected: [
    'The review counts 30 recipes (a Supplements row only for an account that has supplements) and its Replace note says plainly what is replaced; a copy that lost recipes does not look as full as one that kept them.',
  ],
};

export default scenario;
