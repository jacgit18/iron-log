import type { Scenario } from '../scenarios.ts';

// ---- Share target ----
const scenario: Scenario = {
  id: 'S-30', feature: 'Share target', title: 'Share a YouTube link to an exercise', persona: 'superset-builder', brief: 'share-target', device: true,
  steps: [
    'On an Android phone with Loadbearer installed, open a YouTube video and choose Share, then Loadbearer.',
    'In the "Save this link" sheet pick an exercise and confirm.',
    'Share a different link to the same exercise.',
    'On a computer, open Chrome\'s developer tools on the QA site, Application, Manifest, and read the warnings.',
  ],
  expected: [
    'Loadbearer is listed in the share sheet and opens "Save this link" over the board.',
    'The link is saved as the exercise\'s video and shows on its card; a different link first asks "Replace the link on <exercise>?"',
    'The Manifest page shows no warning about the share target\'s enctype, and sharing a link still works as above.',
  ],
};

export default scenario;
