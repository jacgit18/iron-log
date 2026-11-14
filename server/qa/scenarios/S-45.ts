import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-45', feature: 'Admin accounts', title: 'Delete a suspended test account for good', persona: 'recipe-collector', brief: 'admin-delete-account',
  steps: [
    'Signed in as your own admin account, open Settings, Open accounts, and suspend the Recipe collector test account (its masked email is r***@qa.invalid).',
    'Press Delete forever on that row, type the account number shown, and press Delete forever again.',
    'Re-seed the QA test accounts afterwards so Recipe collector exists again.',
  ],
  expected: [
    'Delete forever is disabled until the typed number is exactly the account number, and Cancel closes the form with nothing deleted.',
    'After confirming, the row is gone and Last actions says "Deleted an account"; switching to that test account no longer works.',
  ],
};

export default scenario;
