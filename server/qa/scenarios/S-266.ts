import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-266', feature: 'Plan labels', title: 'Lifetime shows its plan and nothing to pay', persona: 'lifetime', brief: 'feature-map',
  steps: [
    'Sign in as Lifetime on the Runner\'s local scratch stack (`npx tsx scripts/qa-local.mjs seed lifetime`, then open the signInUrl). On that stack only, this account is also an admin with billing on, so the admin-only Billing panel shows; on QA, staging or production it does not, and this scenario cannot run there (record blocked).',
    'Open Settings and scroll to the Billing panel (heading "Billing").',
    'Read the plan line and the buttons under it.',
  ],
  expected: [
    'The panel says "Plan:" with the lifetime plan name and "Nothing to pay."; there is no Plus buy button.',
  ],
};

export default scenario;
