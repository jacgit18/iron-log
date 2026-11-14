import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-48', feature: 'kg beside lb', title: 'Hide the kg figures', persona: 'heavy-logger', brief: 'lb-kg-toggle', edge: true,
  steps: [
    'Open Settings, find Kilograms and turn off Show kg beside lb.',
    'Open a Log sheet and type a weight; open Maxes.',
    'Turn the switch back on.',
  ],
  expected: [
    'No kg figure appears in the Log sheet, Recent or Maxes while it is off.',
    'The kg figures return when it is switched on again; no logged weight changed.',
  ],
};

export default scenario;
