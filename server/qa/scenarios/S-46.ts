import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-46', feature: 'Admin accounts', title: 'Delete forever only on a suspended row', persona: 'new-user', brief: 'admin-delete-account', edge: true,
  steps: [
    'On the Accounts page look at the New user row (n***@qa.invalid) while it is active, then at your own admin row.',
    'Suspend New user and look at its row again, then restore it.',
  ],
  expected: [
    'An active row and an admin row have no Delete forever button.',
    'Once New user is suspended, Delete forever appears beside Restore; after Restore it is gone again.',
  ],
};

export default scenario;
