import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-284', feature: 'Usual portion', title: 'A changed portion becomes the food\'s usual, and Undo puts the old one back', persona: 'recipe-collector', brief: 'nutrition-usual-portion',
  steps: [
    'In Recipes press Log on a recipe, change the portion from the amount the sheet opened at and press Log it. Read the notice.',
    'Press Log on the same recipe again and read the portion the sheet opens at. Log it at that portion and read the notice area.',
    'Log a different amount, then press Undo on the notice. Open Log again.',
  ],
  expected: [
    'The notice reads "Usual portion saved: <amount>." and the entry is logged.',
    'The sheet opens on the saved portion. Logging at it shows no notice and rewrites nothing.',
    'Undo puts the previous usual (or none) back and keeps the logged entry. If the usual was changed after that log, Undo says "The usual portion was changed since, so it was left as it is." Planning a day ahead never changes the usual.',
  ],
};

export default scenario;
