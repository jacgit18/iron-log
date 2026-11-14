import type { Scenario } from '../scenarios.ts';

// ---- Vitamins and minerals (briefs supplement-nutrient-totals, food-vitamins-minerals, recipes-vitamins-minerals, nutrients-without-upper-limit, type-food-amounts, recommendations-by-age-sex, vitamin-mineral-day-meter,
// intake-target-and-safety-checks; QA data for the vitamin and mineral features). The figures below are what the 'vitamin-tracker' account's seed produces (checked against the app's own code on 2026-11-09); nothing here has been walked by the owner. ----
const scenario: Scenario = {
  id: 'S-222', feature: 'Vitamin and mineral totals', title: 'Today\'s Totals read the supplements and the foods, with the warning line under the ticks', persona: 'vitamin-tracker', brief: 'supplement-nutrient-totals',
  steps: [
    'Open Nutrition and read today\'s Supplements: the ticks under Morning, Noon and Night, and the line under them.',
    'Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line). Read the line about food at the top, then the rows for Vitamin D, Zinc and Magnesium, then the No upper limit section and the note at the bottom.',
  ],
  expected: [
    'Morning and Noon are ticked, Night (Magnesium glycinate, "1 capsule") is not. Under the ticks: "Over an upper limit today: Vitamin D. Totals shows what each limit counts. General information, not medical advice."',
    'The food line reads "Food: 2 of 3 eaten foods had vitamin or mineral data. Foods without data add nothing, so food totals can be low."',
    'Vitamin D 125 mcg, "Over the limit by 25 mcg", "Limit 100 mcg" (the bar is full and rust red). Zinc 36 mg, "Close to the limit (90%)", "Supplements 30 mg, food 6 mg." Magnesium "200 mg from supplements", "57% of the limit", "Food 130 mg is not added: this limit counts supplements only." Calcium 820 mg, "41% of the limit".',
    'No upper limit: Potassium 950 mg "Below the recommended range"; Vitamin B12 500.8 mcg "20,867% of the recommended amount"; Fiber 9 g "Below the recommended range"; Sodium 710 mg "31% of the 2,300 mg level to stay under". Nothing in that section is amber or red, and none of it is in the warning line.',
    'The sheet says "Add your birth year and sex in Settings to see your own amounts. Until then the adult range is shown." Each row ends with its recommended amount and "General information, not medical advice."; the bottom note ends "It does not account for pregnancy, breastfeeding, medicines or health conditions, and it is not medical advice."',
  ],
};

export default scenario;
