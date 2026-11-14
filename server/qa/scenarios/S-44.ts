import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-44', feature: 'Admin accounts', title: 'Back and reload on the Accounts page', persona: 'new-user', brief: 'admin-accounts-screen', edge: true, device: true,
  steps: [
    'On a phone, as your admin account, open Settings, then Open accounts.',
    'Reload the page, then swipe back (or press the phone Back button).',
  ],
  expected: [
    'The reload reopens the Accounts page.',
    'Back returns to Settings, not out of the app.',
  ],
};

export default scenario;
