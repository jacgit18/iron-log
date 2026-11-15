import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-221', feature: 'Supplement portions', title: 'No serving size, and an old supplement', persona: 'vitamin-tracker', brief: 'supplement-portions', edge: true,
  steps: [
    'Open a supplement that has nutrient rows but no serving size (or add one) and read "How much you take each time"; press − then + and watch the line under it.',
    'Open a supplement you saved before portions existed and look at today\'s Supplements and Totals.',
  ],
  expected: [
    'With no serving size it counts servings in quarters ("¾ serving" after one −, "1¼ servings" after one + from one serving) from ¼ to 10, and the line says "per serving × ½".',
    'An older supplement shows no tag on the day and Totals counts it exactly as before (one serving per tick).',
  ],
};

export default scenario;
