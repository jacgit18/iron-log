import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-62', feature: 'Finished group', title: 'Edit a done exercise and put cards back', persona: 'superset-builder', brief: 'finished-group-fold',
  steps: [
    'Log a set for an exercise so it is done, open the Finished bar and press Edit on its row; change a number and save.',
    'Press Untick on that row, then press Undo skip on a skipped row.',
  ],
  expected: [
    'Edit opens the log sheet in Edit mode ("You are changing the session logged ...") and the saved number shows.',
    'Each card returns to the open list as a normal card; when the last finished row goes, the bar disappears and the day shows only open cards.',
  ],
};

export default scenario;
