import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-269', feature: 'Plan labels', title: 'A failed payment shows a warning and a way to fix it', persona: 'paid-past-due', brief: 'feature-map', edge: true,
  steps: [
    'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
    'Read the plan line, then press Manage billing if it is there (do not complete anything in Stripe).',
  ],
  expected: [
    'The plan is still paid; the seeded plan comes from Stripe (seedPersona.ts), so the panel says "Plan: Plus", then "Payment failed. Update your card in Manage billing." and has no "Renews on" line. The seed has no Stripe customer, so the Manage billing button may be missing.',
  ],
};

export default scenario;
