import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-77', feature: 'Custom 404', title: 'An installed app still opens, and a wrong address reaches the 404 page', persona: 'new-user', brief: 'custom-404', device: true, edge: true,
  steps: [
    'On a phone with the app installed and opened at least once, open the browser and type the app address followed by /zzz.',
    'Open the installed app from the home screen, then turn on airplane mode and open it again.',
  ],
  expected: [
    'The first step shows the Page not found page, not the app.',
    'The installed app opens normally, online and offline, on its home screen address and on /plans.',
  ],
};

export default scenario;
