import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-271', feature: 'Erased account', title: 'An erased account opens to empty screens', persona: 'erased-account', brief: 'feature-map',
  steps: [
    'Open the Board, the Program tab, Progress, Groceries and Daily, Nutrition in turn.',
    'Open Settings and read the Delete my data panel.',
  ],
  expected: [
    'Every screen shows its empty or first-run state with no program, no log and no groceries, and nothing errors; the Delete my data panel is still offered.',
  ],
};

export default scenario;
