import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-66', feature: 'Program compare', title: 'Compare two programs day by day and filter the differences', persona: 'superset-builder', brief: 'program-compare',
  steps: [
    'Open Program, scroll to the end and tap Compare programs. Program A and Program B are chosen.',
    'Tap Day 2, then open the Filter panel. Pick Changed in the Show rows dropdown (its options carry counts, for example Any difference (5)), then pick a phase in the Phase dropdown (it lists only phases present, plus No phase, and hides when there is none).',
    'Choose a saved program (save a copy of A first if the list is empty) as the second program.',
  ],
  expected: [
    'One list appears under each program\'s phase mix, with the day buttons showing how many exercises differ; each exercise is one row with both programs\' lines (side by side on a wide screen, the second under the first on a phone), tagged Same, Changed, Phase differs or Only in that program, with the editor\'s name, phase, weight and sets; where the two differ, the weight and sets are marked on both sides.',
    'Each filter hides the other rows and the numbers on the chips stay the same; nothing on the page can be dragged or edited, and Program A and B are unchanged afterwards.',
    'A saved copy of A against A shows no differences; choosing the same program on both sides says "Both sides are the same program."',
  ],
};

export default scenario;
