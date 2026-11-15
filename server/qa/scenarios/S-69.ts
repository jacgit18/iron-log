import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-69', feature: 'Polish pass', title: 'Buttons and section tabs respond to a press', persona: 'new-user', brief: 'polish-theme-flash-pressed-errors',
  steps: [
    'Press and hold a section tab (Daily, Progress, Program, Settings) and a plain button such as Cancel on a sheet, without letting go.',
    'Press and hold a Board card button or a Swap day button.',
  ],
  expected: [
    'The tab and the plain button sink slightly and darken while held, and return when released; with "reduce motion" on the phone, they only darken.',
    'The Board card buttons and Swap day buttons look and behave exactly as before.',
  ],
};

export default scenario;
