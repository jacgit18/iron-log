import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-230', feature: 'Food vitamins and minerals', title: 'A ready-made food carries amounts per serving and logging it adds them to the day', persona: 'vitamin-tracker', brief: 'recipes-vitamins-minerals',
  steps: [
    'Open Recipes, find "Fortified cereal" and press Edit. Read "Vitamins and minerals per serving (optional)", then press Cancel.',
    'Go to Nutrition, press Add food, Recipes, then Log beside Fortified cereal and confirm one serving. Press Done, then Totals.',
  ],
  expected: [
    'Four rows, in the table\'s order: Calcium 130 mg, Iron 4.5 mg, Vitamin D 2 mcg, Zinc 1.2 mg.',
    'The coverage line reads "Food: 3 of 4 eaten foods had vitamin or mineral data." Zinc 37.2 mg "Close to the limit (93%)", Vitamin D 127 mcg "Over the limit by 27 mcg", Calcium 950 mg, Iron 7 mg.',
  ],
};

export default scenario;
