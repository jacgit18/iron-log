import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-68', feature: 'Polish pass', title: 'Dark mode opens dark, with no white flash', persona: 'new-user', brief: 'polish-theme-flash-pressed-errors', device: true,
  steps: [
    'On a phone, tap the Colours button until it says dark, then close the app completely.',
    'Open the app again from the home screen or the browser, on a throttled connection if you can.',
  ],
  expected: [
    'The screen is dark from the first moment: no white or light-grey flash before the app appears.',
    'Choosing light, or match this device, and reopening shows light, or the phone\'s own setting, from the first moment as well.',
    'The launch splash (the app icon) is on a dark background in every mode. An installed app may need to be removed and added again before it takes the new colour.',
  ],
};

export default scenario;
