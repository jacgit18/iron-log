import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-70', feature: 'Polish pass', title: 'A file that cannot be read gives a plain sentence', persona: 'new-user', brief: 'polish-theme-flash-pressed-errors', edge: true,
  steps: [
    'In Settings, pick an export file to import that is on a cloud drive and not downloaded to the phone (or one that is revoked or corrupt).',
  ],
  expected: [
    'A plain sentence appears (about downloading it first, or that the file could not be read), with no text such as "Error:", a status number or "undefined".',
  ],
};

export default scenario;
