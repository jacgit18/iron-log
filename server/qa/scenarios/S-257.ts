import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-257', feature: 'Skipped entry', title: 'Skipping writes a Skipped entry for the day', persona: 'superset-builder', brief: 'feature-map',
  steps: [
    'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
    'On the Board skip an exercise, then un-skip it, then skip it again and tick it instead. Open its log.',
  ],
  expected: [
    'Skipping adds a "Skipped" entry for that date with no numbers; un-skip removes it; ticking swaps it for the check-off entry. A real logged session is never overwritten, and stats ignore Skipped.',
  ],
};

export default scenario;
