import type { Scenario } from '../scenarios.ts';

// ---- Recipe video link ----
const scenario: Scenario = {
  id: 'S-26', feature: 'Recipe video link', title: 'Add, open and clear a video link', persona: 'recipe-collector', brief: 'recipe-video-link',
  steps: [
    'Edit a recipe and enter https://www.youtube.com/watch?v=example in Video link, then Save.',
    'Open its detail and tap the link.',
    'Edit again, clear the field and Save.',
  ],
  expected: [
    'The detail shows a "Watch on YouTube" link that opens in a new tab and is at least 44 px tall on a phone width.',
    'After clearing, the link and its row are gone.',
  ],
};

export default scenario;
