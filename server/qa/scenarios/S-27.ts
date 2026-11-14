import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-27', feature: 'Recipe video link', title: 'A link must start with http:// or https://', persona: 'recipe-collector', brief: 'recipe-video-link', edge: true,
  steps: [
    'Edit a recipe and enter "youtube.com/abc" in Video link (a URL box), then press Save.',
    'Then enter "ftp://x.y/z" and press Save.',
    'Then enter "http://youtube.com/abc" and press Save.',
    'Edit again, enter "https://youtube.com/abc" and press Save.',
  ],
  expected: [
    'The browser blocks the bare domain with its own "Please enter a URL." message and nothing saves; the app\'s own text only shows for a value the browser lets through.',
    'The ftp:// link shows the app message "Video link should start with http:// or https://" and nothing saves.',
    'The http:// link is accepted and saved.',
    'The https:// link is accepted and saved.',
  ],
};

export default scenario;
