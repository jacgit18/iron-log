import type { Scenario } from '../scenarios.ts';

// ---- Program tab clarity ----
const scenario: Scenario = {
  id: 'S-114', feature: 'Program tab clarity', title: 'First visit: the guide, the header card and the section tabs (retired 2026-11-13: needs a first visit with cleared site data, which cannot be set up on a shared QA browser; covered by e2e/programTabClarity.spec.js)', persona: 'superset-builder', brief: 'program-tab-clarity', retired: true,
  steps: [
    'On a computer open the Program tab for the first time on this browser (clear the site data first if you have been here).',
    'Read the guide card at the top, then the section tabs (Programs, Exercises, Stretches, Saved, Compare) and the card under them.',
    'Press Open help, close it, then press Got it and reload the page.',
  ],
  expected: [
    'The guide has four steps; step 4 has a Send me the link button. The tabs read Programs, Exercises, Stretches, Saved and Compare, each with a one-line description. The card says "You are editing", Program A, an "On your Board" pill and "N exercises across 7 days", with the A | B switch and Create a program.',
    'Open help shows the Help sheet. Got it hides the guide, and after the reload it stays hidden.',
  ],
};

export default scenario;
