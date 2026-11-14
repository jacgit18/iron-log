import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-13', feature: 'Auto macros', title: 'Calories typed first are not overwritten', persona: 'diet-fresh', brief: 'diet-auto-macros', edge: true,
  steps: [
    'Press Add food, then One-off food, and type Calories 300 first.',
    'Then type protein 20, carbs 20 and fat 5.',
  ],
  expected: [
    'Calories stay at 300 while the macros are typed.',
  ],
};

export default scenario;
