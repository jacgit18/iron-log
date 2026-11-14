import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-105', feature: 'Program compare', title: 'On a phone the programs line up one over the other, and the filters fold behind a button', persona: 'superset-builder', brief: 'program-compare', edge: true,
  steps: [
    'On a phone (or a browser window 375 px wide), open Program, Compare programs. Look at the first rows.',
    'Tap Filter, then Any difference; tap Filter again. Then tap All days, the first of the Day buttons. Then open the same page in a window wider than 800 px.',
  ],
  expected: [
    'Each exercise is one row: the first program\'s line with its name in front of it, the second program\'s line right under it. The Day buttons stay in one row you can swipe sideways, and the status and phase buttons are hidden behind a Filter button.',
    'Filter opens and closes the status and phase buttons, and says "Filter · 1 on" once one is chosen; the rows keep the filter when it is folded. All days lists every day one after the other, each under its own Day heading, with the same filter applied to all of them. On the wide window the programs are two columns under their names, Filter is not shown and the buttons stay in view.',
  ],
};

export default scenario;
