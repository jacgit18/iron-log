import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-36', feature: 'QA picker', title: 'Seed missing accounts and the Recent list', persona: 'new-user', brief: 'qa-picker-access', edge: true,
  steps: [
    'Open the picker and look for an account marked Not seeded (hollow dot) and the "Seed missing accounts" button. If every account is seeded, delete one through the app first (for example Legacy beta).',
    'Press it if shown, then switch to two accounts in turn.',
    'Reopen the picker.',
  ],
  expected: [
    'An unseeded account\'s Switch is disabled with "Seed it first"; pressing Seed missing accounts seeds it, fills the dot and the button goes away.',
    'The last three accounts appear under Recent, newest first.',
    'Leave the picker page idle for several minutes, then open it and switch again: it still opens and lists accounts, with no error page or crash.',
  ],
};

export default scenario;
