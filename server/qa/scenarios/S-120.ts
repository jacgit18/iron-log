import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-120', feature: 'Program desktop layout', title: 'On a computer, Saved and Compare are their own tabs with addresses', persona: 'superset-builder', brief: 'program-tab-desktop-layout', edge: true,
  steps: [
    'On a computer open Program and read the tab strip. Scroll to the bottom of Programs.',
    'Press Saved. Type a name in "Save Program A as" and press Save a copy; do it twice with different names; then type part of one name in the search box and clear it.',
    'Press Compare, then press Back, then reload the page on the Compare tab.',
  ],
  expected: [
    'The tabs read Programs, Exercises, Stretches, Saved, Compare, each with a short line under it. Programs ends after the day and its note: no Saved programs and no Compare strip below it.',
    'Saved shows the Save a copy form on top, the search and sort, and one row per program with Put on Board, Edit, Archive and Delete; the search keeps only names that contain what you typed and says "No saved program matches" when none does. The address reads #/program/saved.',
    'Compare opens full width with the two program pickers and no toggle, its address is #/program/compare, a reload stays on Compare, and Back goes to the screen before the tabs (a tab press replaces the address, so Back does not step back through Saved).',
  ],
};

export default scenario;
