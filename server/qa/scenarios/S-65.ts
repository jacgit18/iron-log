import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-65', feature: 'Weight step', title: 'A step that is not allowed is refused', persona: 'heavy-logger', brief: 'progression-step-per-exercise', edge: true,
  steps: [
    'In Program, Exercises, Edit an exercise and type 60 in the Weight step box; then try 0, 2.3 and abc.',
    'Type 7.5 and save, then open it again. Press Save with the box showing 60 once more.',
  ],
  expected: [
    'Each of 60, 0, 2.3 and abc shows "Enter a step above 0, up to 50, in 0.5 steps." and Save keeps the sheet open without saving.',
    '7.5 is accepted and shown again when the sheet is reopened.',
  ],
};

export default scenario;
