import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-268', feature: 'Plan labels', title: 'Legacy beta says its plan is set by the owner', persona: 'legacy-beta', brief: 'feature-map',
  steps: [
    'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
    'Read the plan line.',
  ],
  expected: [
    'The panel says "Your plan is set by the owner." and offers no way to buy.',
  ],
};

export default scenario;
