import type { Scenario } from '../scenarios.ts';

// ---- QA picker ----
const scenario: Scenario = {
  id: 'S-34', feature: 'QA picker', title: 'Switch between test accounts and return to admin', persona: 'new-user', brief: 'qa-picker-access',
  steps: [
    'On a test account, press Switch on the QA banner.',
    'In the sheet search for "diet" and switch to Diet, on target.',
    'Press Return to admin on the banner.',
  ],
  expected: [
    'The sheet opens with "You are: New user"; the search narrows the list; the switch signs you in as Diet, on target after the wipe prompt.',
    'Return to admin restores your own session.',
  ],
};

export default scenario;
