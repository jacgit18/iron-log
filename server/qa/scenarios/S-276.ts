import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-276', feature: 'Launcher shortcuts', title: 'Loadbearer is in the Android share list', persona: 'superset-builder', brief: 'share-target', device: true, edge: true,
  steps: [
    'On an Android phone with Loadbearer installed (the Play app or the web app installed from Chrome), open a YouTube video and choose Share.',
    'Look for Loadbearer in the share list and choose it.',
  ],
  expected: [
    'Loadbearer is listed in the share sheet for a plain-text link and opens "Save this link" over the board (S-30 covers saving it). A Play wrapper built before the share entry was added is missing from the list.',
  ],
};

export default scenario;
