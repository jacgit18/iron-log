import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-119', feature: 'Program desktop layout', title: 'On a computer, Add exercise and Copy day sit in the day heading and the days are one row of tabs', persona: 'superset-builder', brief: 'program-tab-desktop-layout',
  steps: [
    'On a computer (a window at least 1280 px wide), open Program. Look at the day heading "Program A · Day 1" and the row under the header card.',
    'Press Copy day…, pick another day and press Copy. Then press Undo on the notice.',
    'Press a different day tab, then press + Add exercise.',
  ],
  expected: [
    'One row of tabs Day 1 to Day 7 sits under the header card, each with its exercise count (or "rest"); there is no arrow or dropdown. The Day label field is under the heading, and Copy day… and + Add exercise are normal-height buttons at the right of the heading.',
    'Copy day… opens the day picker under the Day label (the picker stays open for that day); Copy shows the Copied notice and Undo takes it back.',
    'The day tab you pressed is highlighted and the heading names that day; + Add exercise opens the same add sheet as before.',
  ],
};

export default scenario;
