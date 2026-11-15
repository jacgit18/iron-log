import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-109', feature: 'Ideas to try', title: 'Stretches to try and Help use the new name, and nothing else on the page still says Experiments', persona: 'superset-builder', brief: 'ideas-to-try-rename', edge: true,
  steps: [
    'On the Board press Stretches at the top. Look for the line about trying a stretch you saw online, and at the heading under the days.',
    'Press "+ Add stretch" and read the sheet\'s title; Cancel.',
    'Go back to Workout, press Help at the top and read the Board item under "Where things are" and the "Words and abbreviations" list.',
  ],
  expected: [
    'The heading under the stretch days reads "Stretches to try" and its button "+ Add stretch"; the line reads "To try a stretch you saw online, add it under Stretches to try, below, with a link to the video."',
    'The sheet is titled "Add a stretch to try".',
    'Help says "Ideas to try sit under the days" in its Board part and has an "Ideas to try" entry among its terms; the word "Experiments" does not appear in Help. (An exported workbook still has a sheet named Experiments, on purpose, so older files import.)',
  ],
};

export default scenario;
