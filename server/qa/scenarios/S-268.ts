import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-268', feature: 'Plan labels', title: 'Legacy beta says its plan is set by the owner', persona: 'legacy-beta', brief: 'feature-map',
  steps: [
    'Sign in as Legacy beta on the Runner\'s local scratch stack (`npx tsx scripts/qa-local.mjs seed legacy-beta`, then open the signInUrl). On that stack only, this account is also an admin with billing on, so the admin-only Billing panel shows; on QA, staging or production it does not, and this scenario cannot run there (record blocked).',
    'Open Settings and scroll to the Billing panel (heading "Billing").',
    'Read the plan line.',
  ],
  expected: [
    'The panel says "Your plan is set by the owner." and offers no way to buy.',
  ],
};

export default scenario;
