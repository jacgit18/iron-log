import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-31', feature: 'Share target', title: 'Share a link to a recipe, and share with no link', persona: 'meal-planner', brief: 'share-target', device: true, edge: true,
  steps: [
    'Share a video link from the phone to Loadbearer and choose one of your recipes.',
    'Share again and choose New recipe with this link.',
    'Share plain text with no web address.',
  ],
  expected: [
    'The link is saved on the chosen recipe; "New recipe with this link" opens the recipe form with the link and title filled in.',
    'A share with no usable link says "No web link found in what you shared." with Close.',
    'Back closes the sheet and a reload does not reopen it.',
  ],
};

export default scenario;
