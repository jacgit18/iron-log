import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-224', feature: 'Vitamin and mineral totals', title: 'The target line and the 7-day average sit apart from the limit', persona: 'vitamin-tracker', brief: 'intake-target-and-safety-checks',
  steps: [
    'Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) ("What I took") and read, for Calcium, Zinc, Magnesium and Vitamin D, the line that starts "Target:" and the line that starts "7-day average".',
    'Read the 7-day average of Potassium in the No upper limit section.',
  ],
  expected: [
    'Target lines: Calcium "Below the recommended amount (82%)", Zinc "Above the recommended amount", Magnesium "Meets the recommended amount" (food counts for the target even though the magnesium limit counts supplements only), Vitamin D "Above the recommended amount". None of them mentions the limit.',
    '7-day averages: Calcium "534.29 mg (7 days with data)", Zinc "18.86 mg", Vitamin D "60.43 mcg", Magnesium "171.43 mg from supplements", Potassium "1,721.43 mg (7 days with data)". A day with no data is skipped, never counted as zero.',
  ],
};

export default scenario;
