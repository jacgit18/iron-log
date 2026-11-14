import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-275', feature: 'Launcher shortcuts', title: 'Long-press the app icon: four shortcuts with their own icons', persona: 'new-user', brief: 'feature-map', device: true,
  steps: [
    'On an Android phone with Loadbearer installed (the Play app on wrapper version 6 or later, or the web app installed from Chrome), long-press the Loadbearer icon on the home screen.',
    'Read the menu, then open each shortcut in turn (Progress and Nutrition included), going back to the home screen between them.',
  ],
  expected: [
    'Four shortcuts are listed, each with its own icon (a barbell, a calendar tick, a rising line, a fork and knife); Progress opens the Progress tab and Nutrition opens the Nutrition screen inside Daily. An older Play wrapper shows fewer or no shortcuts: that is the old build, not a bug.',
  ],
};

export default scenario;
