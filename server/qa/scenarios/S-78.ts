import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-78', feature: 'Custom 404', title: 'Real pages, files and in-app addresses are not affected', persona: 'new-user', brief: 'custom-404', edge: true,
  steps: [
    'Open /plans, /delete-account and /privacy.html.',
    'Open /assets/old.js, and then the app with #/progress/zzz after the address.',
  ],
  expected: [
    'The first three open as they did before. /privacy without .html shows Page not found on a first visit; in a browser where the app\'s service worker is already active the Privacy Policy may still open.',
    '/assets/old.js shows a small plain 404 error, not the Loadbearer page. #/progress/zzz opens Progress.',
  ],
};

export default scenario;
