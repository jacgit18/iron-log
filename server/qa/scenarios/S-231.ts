import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-231', feature: 'Typed amounts', title: 'Type vitamin and mineral amounts on a one-off food', persona: 'diet-fresh', brief: 'type-food-amounts',
  steps: [
    'Press Add food, then One-off food. Type the name "Burrito bowl", 300 calories and 20 protein. Press "Vitamins and minerals (optional)".',
    'Press "+ Add a nutrient", leave Calcium and type 180. Press "+ Add a nutrient" again, choose Vitamin B12, type 0.01 and change its unit to mg. Press Add, then close the sheet.',
    'In Eaten, press Edit on Burrito bowl, read the rows, then Cancel. Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
  ],
  expected: [
    'The section is closed when the form opens. After Add the food is in Eaten.',
    'Edit shows Calcium 180 mg and Vitamin B12 10 mcg (0.01 mg is stored as 10 mcg).',
    'Totals: Calcium 180 mg "9% of the limit"; Vitamin B12 10 mcg "417% of the recommended amount" in the No upper limit section.',
  ],
};

export default scenario;
