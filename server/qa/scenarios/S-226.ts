import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-226', feature: 'Vitamin and mineral day line', title: 'A folded line under Supplements names the two nearest their limits', persona: 'vitamin-tracker', brief: 'vitamin-mineral-day-meter',
  steps: [
    'On today, read the line under the Supplements bar. Press it.',
    'Read the bars, then press the link at the bottom.',
  ],
  expected: [
    'The closed line (one tap tall) reads "Vitamins and minerals: Vitamin D over · Zinc 90%", with words as well as colour.',
    'Opened, five thin bars: Vitamin D (over, rust), Zinc 90%, Magnesium 57%, Calcium 41% and Iron 6%. The link says "All N in Totals" (N is the number of limited nutrients with data that day, about 6 to 8; read it off the sheet) and opens the Totals sheet for that day. Pressing the line again folds it.',
  ],
};

export default scenario;
