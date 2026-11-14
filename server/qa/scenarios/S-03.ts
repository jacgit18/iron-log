import type { Scenario } from '../scenarios.ts';

// ---- Goal calories and pace ----
const scenario: Scenario = {
  id: 'S-03', feature: 'Goal calories and pace', title: 'Missing goal weight, then a recommended target', persona: 'diet-fresh', brief: 'diet-pace',
  steps: [
    'Open Daily, Nutrition, press Manage and read Daily targets: no targets are saved and no goal weight is set.',
    'Manage shows "No goal set" under Daily targets. Press Edit in Progress (or the "Set a goal weight" button under Daily targets), set a goal 15 lb below the latest body weight (about 180 lb is seeded) in the Body weight chart it opens, then open Nutrition and Manage again.',
    'Read Daily targets again.',
    'Pick each pace chip in turn: Slow, Steady, Fast.',
  ],
  expected: [
    'Before the goal: Daily target names what is missing ("Set a goal weight") instead of showing numbers.',
    'After the goal: calories, protein, fat and carbs appear labelled as an estimate, with a sentence about calories to stay the same, the daily change and the weeks to the goal; the board\'s meters now show that calorie target.',
    'Each pace changes the calories and the weeks; the pick survives a reload.',
  ],
};

export default scenario;
