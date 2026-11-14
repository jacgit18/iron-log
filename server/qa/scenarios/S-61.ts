import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-61', feature: 'Finished group', title: 'Done and skipped exercises fold into one bar', persona: 'superset-builder', brief: 'finished-group-fold',
  steps: [
    'Open the Board on Day 1. Tick one exercise and skip another from its ⋯ menu.',
    'Look at the bottom of the day: press the Finished bar to open it, then press it again to close it.',
  ],
  expected: [
    'Both cards leave the list of open cards, which keeps its usual look. A closed Finished (2) bar sits below them with "1 done" and "1 skipped".',
    'Open, it shows one short row per exercise: the done one has Edit and Untick, the skipped one has Undo skip. Closed, only the bar shows.',
  ],
};

export default scenario;
