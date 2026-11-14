import type { Scenario } from '../scenarios.ts';

// ---- Auto macros ----
const scenario: Scenario = {
  id: 'S-12', feature: 'Auto macros', title: 'Calories follow typed macros', persona: 'diet-on-target', brief: 'diet-auto-macros',
  steps: [
    'Press Add food, then One-off food. Type protein 30, carbs 50 and fat 10 without touching Calories.',
    'Change Calories by hand to 500, then change protein to 40.',
  ],
  expected: [
    'Calories fill in as 410 (4 x 30 + 4 x 50 + 9 x 10).',
    'After a hand edit, Calories stays at 500 when a macro changes: a manual number always wins.',
  ],
};

export default scenario;
