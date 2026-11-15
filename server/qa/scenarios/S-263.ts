import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-263', feature: 'Supplement add sheet', title: 'All 28 nutrients are offered in grouped pickers', persona: 'vitamin-tracker', brief: 'supplement-more-nutrients',
  steps: [
    'Press Reset on Vitamin tracker first (switch to another account to do it), then switch back.',
    'Edit a supplement, press "+ Add a nutrient", and read the picker. Then open One-off food on Nutrition, "Vitamins and minerals (optional)" and its "+ Add a nutrient".',
  ],
  expected: [
    'Both pickers offer all 28 nutrients, grouped under headings. A new row starts on a nutrient the item does not have yet, and choosing one it already has says "X in mg is listed twice; only the first is kept." on the supplement form and "X is listed twice; only the first is kept." on the food form.',
  ],
};

export default scenario;
