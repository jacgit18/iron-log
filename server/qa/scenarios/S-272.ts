import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-272', feature: 'Large history', title: 'Three years of history still opens and exports', persona: 'three-year-veteran', brief: 'feature-map',
  steps: [
    'Open Progress and move through its views and date ranges, then open History.',
    'In Settings, Data, press Export all data and wait for it to finish.',
  ],
  expected: [
    'Progress and History open within a few seconds and reach back about three years; the export completes and the file opens; the Board stays responsive after the large history loads.',
  ],
};

export default scenario;
