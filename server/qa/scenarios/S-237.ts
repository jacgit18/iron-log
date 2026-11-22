import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-237', feature: 'Vitamin and mineral totals', title: 'Every account sees every vitamin and mineral part', persona: 'paid-monthly', brief: 'feature-map', edge: true,
  steps: [
    'Press Manage, Supplements and library, then + Add, then "Open the full form, with amounts", and look for "What is in one serving (optional)" and "How much you take each time".',
    'Open Settings > App and look for "Recommended amounts". On Nutrition press Add food, One-off food and look for "Vitamins and minerals (optional)". Open Recipes, press + New, Add a food, and look for "Vitamins and minerals per serving (optional)".',
  ],
  expected: [
    'All four are there for an ordinary account: the vitamin and mineral features are open to everyone (released 2026-11-09), not only to admins.',
  ],
};

export default scenario;
