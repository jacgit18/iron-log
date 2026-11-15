import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-35', feature: 'QA picker', title: 'Reset a test account to its starting data', persona: 'diet-on-target', brief: 'qa-picker-access',
  steps: [
    'The picker is for admins: on the QA Runner\'s local stack, sign in as the stack\'s test admin first (qa-local-admin), open "QA test accounts" in the account menu, switch to Diet, on target, and start there.',
    'As Diet, on target, delete today\'s entries and add a recipe.',
    'Switch to another account, open the picker and press Reset on Diet, on target.',
    'Switch back and open Nutrition.',
  ],
  expected: [
    'Reset is disabled on the account you are on ("Switch away to reset it").',
    'After Reset, the account is back to its seed: three foods today and the saved meal you added is gone. This account is seeded with no recipes (for a recipe check use Meal planner or Recipe collector).',
  ],
};

export default scenario;
