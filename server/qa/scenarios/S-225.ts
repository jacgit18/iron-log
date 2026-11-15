import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-225', feature: 'Vitamin and mineral totals', title: 'Supplements alone: no target verdict, and an unticked day says nothing is ticked', persona: 'diet-fresh', brief: 'intake-target-and-safety-checks', edge: true,
  steps: [
    'Press Manage, Supplements and library, then + New. Name it "Zinc", add the row Zinc 15 mg, press Save, then Done. Do not tick it.',
    'Read the line under Supplements on today, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
    'Close the sheet, tick Zinc, and open Totals again (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
  ],
  expected: [
    'Unticked: under the Supplements bar "Vitamins and minerals: nothing ticked yet", and Totals says "Nothing ticked on this day yet."',
    'Ticked: Zinc 15 mg, "38% of the limit", "7-day average: 15 mg (1 day with data)". There is no "Target:" line (supplements alone cannot say below) and no line about food.',
  ],
};

export default scenario;
