import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-177', feature: 'Library rows', title: 'Library rows: In Mine check and a one-tap Add with Undo', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab',
  steps: [
    'Open Recipes and press Library. Read a row: it has no Library pill. Press + Add on one row.',
    'Read the notice, press Undo, then press + Add on the same row again and press Open.',
    'Go back to Library and read that row.',
  ],
  expected: [
    'The row\'s + Add copies it and the notice says "<name> added to Mine." with Open, Undo and Dismiss.',
    'Undo takes the copy away silently. Adding again and pressing Open shows the copy in Mine.',
    'That Library row now shows a check named In Mine and no + Add button.',
  ],
};

export default scenario;
