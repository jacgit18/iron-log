import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-272', feature: 'Large history', title: 'Three years of history still opens and exports', persona: 'three-year-veteran', brief: 'feature-map',
  steps: [
    'Open Progress (on a phone the hub shows the latest 6 weeks) and read the Body weight table: it says "Showing the latest 6 of 156" and that all of them are in the Excel and data exports. Open Training trends (#/progress/trends; on a desktop the Progress page shows the same sections) and read Sets logged per week, Weekly volume and Muscles trained per week. Open Weekly history: on a phone press All 12 weeks on the Progress hub (#/progress/hist); on a desktop it already lists 12.',
    'In Settings, Backups & data (called Sync, backups & data when syncing is on), open the collapsed "Save or load a file yourself" section, press Export all data and wait for it to finish (it downloads iron-log-data-<date>.json: a Runner needs the owner\'s yes first; if it has none, record the export as not run, not as a pass).',
    'Open the Board and move between two days.',
  ],
  expected: [
    'Progress opens within a few seconds. The page shows only recent weeks although the data goes back about three years: Weekly history lists the latest 12 weeks (some days partly ticked, "0/6 days" is fine; no fully completed day is promised), the Sets logged per week and Weekly volume charts show about 12 weeks, Muscles trained per week about 8, and the Body weight table says "Showing the latest 6 of 156".',
    'The export completes and the file opens. It holds the whole history, about three years: about 5,000 log entries (under logs, keyed by exercise), about 157 weeks and 156 weekly weights.',
    'The Board stays responsive after the large history loads.',
  ],
};

export default scenario;
