import type { Scenario } from '../scenarios.ts';

// ---- Admin accounts (run as the owner's own admin account; the persona is the test account acted on) ----
const scenario: Scenario = {
  id: 'S-41', feature: 'Admin accounts', title: 'Read the cap and the account list', persona: 'new-user', brief: 'admin-accounts-screen',
  steps: [
    'Signed in as your own admin account, open Settings and press Open accounts.',
    'Look at the cap, the counts and the list of newest accounts.',
  ],
  expected: [
    'The address ends #/settings/accounts and the page shows the sign-up cap used, free and paid counts and a suspended count.',
    'Each account is a masked email such as j***@gmail.com with its number, plan and join date; no name, full email or workout content appears; admin accounts have no Suspend button.',
  ],
};

export default scenario;
