import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-121', feature: 'Program desktop layout', title: 'On a phone Program keeps its three tabs and day stepper, and Compare sits above Saved programs', persona: 'superset-builder', brief: 'program-tab-desktop-layout', edge: true,
  steps: [
    'On a phone (or a window under 700 px wide) open Program and read the tab strip and the day control.',
    'Scroll to the end of Programs and read the order of the last two sections.',
    'Type #/program/saved at the end of the address and open it.',
  ],
  expected: [
    'The tabs read Programs, Exercises, Stretches. The A | B switch is two equal halves. The day control is the arrows and the "Day N of 7" dropdown, as before; there are no Day tabs and + Add exercise is full width.',
    'Compare programs (a collapsed strip) comes before Saved programs.',
    'The address opens Programs, since a phone has no Saved tab.',
  ],
};

export default scenario;
