import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-223', feature: 'Vitamin and mineral totals', title: 'What I took, Everything scheduled, and unticking moves the warning', persona: 'vitamin-tracker', brief: 'supplement-nutrient-totals',
  steps: [
    'Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line), then "Everything scheduled". Read the Magnesium row.',
    'Close the sheet. Untick Vitamin D3 under Noon, read the line under the ticks, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) ("What I took") and look for a Vitamin D row.',
    'Tick Vitamin D3 again.',
  ],
  expected: [
    'On Everything scheduled, Magnesium is "300 mg from supplements", "Close to the limit (86%)", listing "Magnesium glycinate 200 mg" and "Magnesium glycinate (1 capsule) 100 mg" (the Night intake counts at half a serving).',
    'Unticked: the warning line is gone and What I took has no Vitamin D row (no food today lists vitamin D). Ticked again: the warning line and the row come back.',
  ],
};

export default scenario;
