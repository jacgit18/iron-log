import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-67', feature: 'Program compare', title: 'An empty day, and a day that exists on one side only', persona: 'superset-builder', brief: 'program-compare', edge: true,
  steps: [
    'On a phone (or a 375 px wide window), as a new account, create a program, open Program, Compare programs, and pick it against Program A.',
    'Step through the day buttons.',
  ],
  expected: [
    'A day empty on both sides says "Nothing on this day in either program."; a day with exercises on one side lists them all as Only in that program, with "Not in this program" on the other side.',
    'The section is closed again after you leave the Program tab and come back, and the phone view does not scroll sideways.',
  ],
};

export default scenario;
