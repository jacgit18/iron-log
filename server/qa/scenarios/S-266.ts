import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-266', feature: 'Plan labels', title: 'Lifetime shows its plan and nothing to pay', persona: 'lifetime', brief: 'feature-map',
  steps: [
    'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
    'Read the plan line and the buttons under it.',
  ],
  expected: [
    'The panel says "Plan:" with the lifetime plan name and "Nothing to pay."; there is no Plus buy button.',
  ],
};

export default scenario;
