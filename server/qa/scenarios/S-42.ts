import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-42', feature: 'Admin accounts', title: 'Suspend and restore a test account', persona: 'new-user', brief: 'admin-accounts-screen',
  steps: [
    'On the Accounts page find the New user test account (its masked email is n***@qa.invalid) and press Suspend, then press Press again to suspend.',
    'Use the account menu to switch to the New user test account.',
    'Return to your admin account and press Restore on that row.',
    'Switch to the New user test account again.',
  ],
  expected: [
    'The row shows Suspended and Last actions lists "Suspended account" with the number.',
    'As the suspended account every screen shows "This account is suspended" and nothing syncs; Settings still offers export and delete.',
    'After Restore the notice is gone and the app works as before with no data lost.',
  ],
};

export default scenario;
