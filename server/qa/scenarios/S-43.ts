import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-43', feature: 'Admin accounts', title: 'A non-admin cannot reach the page', persona: 'paid-monthly', brief: 'admin-accounts-screen', edge: true,
  steps: [
    'Switch to the Paid, monthly test account and open Settings.',
    'Type #/settings/accounts at the end of the address and press Enter.',
  ],
  expected: [
    'Settings has no Accounts section and no Open accounts button.',
    'The typed address shows Settings and no list of accounts.',
  ],
};

export default scenario;
