import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-35', feature: 'QA picker', title: 'Reset a test account to its starting data', persona: 'diet-on-target', brief: 'qa-picker-access',
  steps: [
    'The picker is for admins: on the QA Runner\'s local stack, sign in as the stack\'s test admin first (qa-local-admin), open "QA test accounts" in the account menu (or the banner\'s Switch button) and press Switch on Diet, on target. If you seeded a test account after the picker was open, close and reopen it. The banner then reads "QA test account: Diet, on target" with a "Return to admin" button; start there.',
    'As Diet, on target, open Daily > Nutrition and delete today\'s entries. Then go to Recipes > Mine and write a recipe with one ingredient (the form needs at least one).',
    'Switch to another account, open the picker and press Reset on Diet, on target.',
    'Switch back and open Daily > Nutrition, then Recipes > Mine.',
  ],
  expected: [
    'Reset is disabled on the account you are on ("Switch away to reset it").',
    'After Reset, the account is back to its seed: three foods today and the recipe you wrote is gone. This account is seeded with no recipes (for a recipe check use Meal planner or Recipe collector).',
  ],
};

export default scenario;
