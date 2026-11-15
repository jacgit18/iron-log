import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-235', feature: 'Age and sex amounts', title: 'A bad year, "Prefer not to say" and Clear', persona: 'vitamin-tracker', brief: 'recommendations-by-age-sex', edge: true,
  steps: [
    'In Settings > Recommended amounts choose Female, then type 85, then replace it with 2012, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) on today.',
    'Type 1974, choose "Prefer not to say", and open Totals again. Then press Clear and open Totals once more.',
  ],
  expected: [
    '85 shows "Enter a four-digit year, like 1985." and saves nothing (after a reload the year box is empty; the sex you chose stays). 2012 saves but says "Amounts are shown for ages 19 and over, so the adult range is used.", and Totals says "Amounts for your age are not shown. The adult range is used."',
    'With a year and "Prefer not to say", Totals says "Your own amounts need both a birth year and a sex, so the adult range is shown. You can change this in Settings." After Clear the year box is empty, "Prefer not to say" is the one selected (it is what no answer looks like), and Totals asks you to add them.',
  ],
};

export default scenario;
