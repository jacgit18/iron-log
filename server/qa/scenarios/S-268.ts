import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-268', feature: 'Plan labels', title: 'Legacy beta says its plan is set by the owner', persona: 'legacy-beta', brief: 'feature-map',
  steps: [
    'Open Settings and find the Billing panel (it is admin-only until Billing goes live, `billing: \'admin\'` in `src/features.ts`, so a test account has none; if it is missing, record blocked and stop).',
    'Read the plan line.',
  ],
  expected: [
    'The panel says "Your plan is set by the owner." and offers no way to buy.',
  ],
};

export default scenario;
