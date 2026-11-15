import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-272', feature: 'Large history', title: 'Three years of history still opens and exports', persona: 'three-year-veteran', brief: 'feature-map',
  steps: [
    'Open Progress and read the Body weight table, then open Training trends (#/progress/trends) and read Sets logged per week, Weekly volume and Muscles trained per week, then open Weekly history and press All 12 weeks.',
    'In Settings, Data, press Export all data and wait for it to finish (it downloads a file: a Runner needs the owner\'s yes first; if it has none, record the export as not run, not as a pass).',
    'Open the Board and move between two days.',
  ],
  expected: [
    'Progress opens within a few seconds. The Body weight table says "Showing the latest 6 of 156" (about three years of weekly weights), the Training trends charts show bars for the last weeks and Weekly history lists 12 weeks, each with ticked days (the page shows at most 12 weeks, not all three years).',
    'The export completes and the file opens, and holds the large history (about 5,000 log entries).',
    'The Board stays responsive after the large history loads.',
  ],
};

export default scenario;
