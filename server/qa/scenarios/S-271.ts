import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-271', feature: 'Erased account', title: 'An erased account opens to empty screens', persona: 'erased-account', brief: 'feature-map',
  steps: [
    'Open the Board, the Program tab, Progress, Groceries and Daily, Nutrition in turn.',
    'Open Settings and read the Delete my data panel.',
    'Device-only: if another device still holds this account\'s old data, open the app there and read what it shows.',
  ],
  expected: [
    'Every screen shows its empty or first-run state with no program, no log and no groceries, and nothing errors; the Delete my data panel is still offered.',
    'On the other device (step 3; a second device is needed): it resets to empty rather than uploading its old data, because the account is on a later data epoch.',
  ],
};

export default scenario;
