import type { Scenario } from '../scenarios.ts';

// ---- Supplement portions (brief supplement-portions, ADR 114). Written from the brief and the code's own labels; nothing here has been walked by the owner. ----
const scenario: Scenario = {
  id: 'S-219', feature: 'Supplement portions', title: 'Say how many capsules you take and see the amount', persona: 'meal-planner', brief: 'supplement-portions',
  steps: [
    'Press Manage, Supplements and library, then + New. Name it "Magnesium glycinate", add the row Magnesium 200 mg, and type 2 in "Capsules or tablets in one serving".',
    'In "How much you take each time" press − once, then + twice, reading the line under the stepper each time. Press Save, then Done.',
    'On today\'s Supplements tick it, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
  ],
  expected: [
    'The stepper starts at "2 capsules" with "200 mg magnesium" (the row is the amount in one label serving, which is 2 capsules); − gives "1 capsule" and "100 mg magnesium"; + twice gives "3 capsules" and "300 mg magnesium", each with the working under it ("3 × 100 mg per capsule = 300 mg" style).',
    'After saving, today\'s row reads "Magnesium glycinate 3 capsules" next to its tick, and Totals counts the amount you chose, naming "(3 capsules)" beside the product.',
  ],
};

export default scenario;
