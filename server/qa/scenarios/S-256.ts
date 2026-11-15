import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-256', feature: 'Exercise notes', title: 'A note follows the exercise everywhere', persona: 'superset-builder', brief: 'exercise-notes-persist',
  steps: [
    'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
    'In Program, open a card\'s sheet and save a Note. Open the same exercise on the Board and in Ideas to try or Add to day.',
    'Edit the note in one place, then clear it.',
  ],
  expected: [
    'The note shows on every Board card and idea for that exercise, the field says it is shared, and editing or clearing it in one place changes it in all (200 characters at most).',
  ],
};

export default scenario;
