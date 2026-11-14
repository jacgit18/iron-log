import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-234', feature: 'Age and sex amounts', title: 'A birth year and sex change your own limit and recommended amount', persona: 'vitamin-tracker', brief: 'recommendations-by-age-sex',
  steps: [
    'Open Settings, find "Recommended amounts" in the App group, type 1974 as the birth year and choose Female.',
    'Go back to Nutrition, open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) and read Calcium, Magnesium and Zinc, then Vitamin B12.',
  ],
  expected: [
    'Calcium: "Limit 2,000 mg for ages 51 to 70" and "Recommended for women ages 51 to 70: 1,200 mg a day." Magnesium: "Recommended for women ages 31 and over: 320 mg a day." Zinc: "Recommended for women ages 19 and over: 8 mg a day."',
    'Vitamin B12 reads "20,867% of the recommended amount for women ages 19 and over". The note at the top says the amounts are for the age and sex given and do not cover pregnancy or breastfeeding.',
  ],
};

export default scenario;
