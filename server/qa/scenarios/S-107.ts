import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-107', feature: 'Program compare', title: 'On a wide screen Compare opens on All days in a wider panel; a narrower window starts on the current day', persona: 'superset-builder', brief: 'program-compare', edge: true,
  steps: [
    'On a computer, in a window 1000 px wide or more, open Program, then press Compare programs to open the panel. Look at which button in the Day strip is highlighted, and at how wide the panel is.',
    'Make the window narrower than 1000 px (or open the same page on a phone), reload, and open Compare programs again.',
  ],
  expected: [
    'All days is highlighted and the days are cards side by side, each with its own Day heading and three columns (name, Program A, Program B): three cards across at 1920 px, two from a window about 1360 px wide (when the panel is 1240 px or more) and one below that. The panel fills the page width, not the narrow 760 px column it used to be, and the status and phase buttons stay in view. Pressing one day shows just that day as a single card.',
    'In the narrower window the editor\'s current day (Day 1 for a fresh account) is highlighted instead, there are no day headings, and All days is still there to press.',
  ],
};

export default scenario;
