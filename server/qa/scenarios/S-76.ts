import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-76', feature: 'Custom 404', title: 'A wrong page address shows the Page not found page', persona: 'new-user', brief: 'custom-404',
  steps: [
    'In a browser, signed out, open the app address followed by /zzz (for example qa.loadbearer.app/zzz).',
    'Tap Go to Loadbearer. Then sign in and open /zzz again.',
  ],
  expected: [
    'A plain Page not found page with the line "That address does not exist." appears, light or dark to match the device, and it does not repeat the address you typed.',
    'Go to Loadbearer opens the landing page when signed out and the app when signed in. The page looks the same signed in and out.',
  ],
};

export default scenario;
