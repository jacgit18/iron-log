import type { Scenario } from '../scenarios.ts';

// ---- Recipe auto-match (On your list) ----
const scenario: Scenario = {
  id: 'S-71', feature: 'Recipe auto-match', title: 'A missing ingredient already on the list says On your list', persona: 'recipe-collector', brief: 'feature-map',
  steps: [
    'Open "Chicken and rice bowl" and note an ingredient shown as Missing that has an item on Groceries, Shopping (add one with the ingredient\'s name if there is none).',
    'Look at that line, then press Add missing to Shopping.',
    'Open Groceries, Shopping and check how many times the item appears.',
  ],
  expected: [
    'The line shows Missing with a small "On your list" mark beside it; an ingredient that is at home, skipped or "Always at home" (water) never shows it.',
    'Add missing does not add that item a second time; it stays on the list once.',
  ],
};

export default scenario;
