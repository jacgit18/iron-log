import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-177', feature: 'Library rows', title: 'Library rows: a one-tap + Add to mine with Undo, and the copy moves up', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab',
  steps: [
    'Open Recipes and press the Library pill (beside All and Mine). Read a row in the dashed "Library · not in your recipes yet" box: it has a + Add to mine button. Press it.',
    'Read the notice, press Undo, then press + Add to mine on the same row again and press Open.',
    'Go back to Recipes, press the Library pill again and look for that recipe, then press the All pill, press "Browse the library" and look for it under the "Your recipes" heading.',
  ],
  expected: [
    'The row\'s + Add to mine copies it and the notice says "<name> added to Mine." with Open, Undo and Dismiss.',
    'Undo takes the copy away and the row is back in the Library box. Adding again and pressing Open shows the copy in Mine.',
    'A recipe you have a copy of is no longer in the Library box (it is listed once, under "Your recipes", which shows as a heading once the Library box is open).',
  ],
};

export default scenario;
