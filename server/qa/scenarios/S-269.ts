import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-269', feature: 'Plan labels', title: 'A failed payment shows a warning and a way to fix it', persona: 'paid-past-due', brief: 'feature-map', edge: true,
  steps: [
    'Sign in as Paid, past due on the Runner\'s local scratch stack (`npx tsx scripts/qa-local.mjs seed paid-past-due`, then open the signInUrl). On that stack only, this account is also an admin with billing on, so the admin-only Billing panel shows; on QA, staging or production it does not, and this scenario cannot run there (record blocked).',
    'Open Settings and scroll to the Billing panel (heading "Billing").',
    'Read the plan line, then press Manage billing if it is there (do not complete anything in Stripe).',
  ],
  expected: [
    'The plan is still paid; the seeded plan comes from Stripe (seedPersona.ts), so the panel says "Plan: Plus", then "Payment failed. Update your card in Manage billing." and has no "Renews on" line. The seed has no Stripe customer, so the Manage billing button is missing: note that, it is a limit of the seed and not a failure (the scratch stack has no real Stripe to open).',
  ],
};

export default scenario;
