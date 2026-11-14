import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-296', feature: 'Desktop week card', title: 'Stretches on a desktop: the week row and the progress are one card', persona: 'heavy-logger', brief: 'feature-map',
  steps: [
    'On a desktop (1280 px wide) open Board and press Stretches. Read the top under the Workout and Stretches buttons.',
    'Change the week with the arrows, press This week, and tick a stretch on today.',
    'Narrow the window to 768 px, then 701 px, then widen to 1920 px. Turn on large text.',
  ],
  expected: [
    'There is one bordered card with the week arrows, the date range (on one line) and This week at the left, and the progress text ("N of 7 days done", with "Today X of Y" in this week) and its bar at the right end of the same row. There are no day tabs: the seven columns are the days.',
    'The arrows change the week and the progress follows; ticking a stretch moves today\u2019s count and the bar.',
    'At the narrower widths and at large text the progress wraps onto its own line inside the card; nothing runs past the card or scrolls sideways. On a phone there is no such card: Stretches keeps the joined week and day card with no progress line.',
  ],
};

export default scenario;
