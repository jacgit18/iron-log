import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-201', feature: 'Nutrition board', title: 'Log with One-off food and Quick add', persona: 'recipe-collector', brief: 'nutrition-board',
  steps: [
    'Press Add food, then One-off food, add "Rice" 300 kcal and 20 g protein.',
    'In Recipes press Ate this on one recipe (the chips list recipes you have logged or starred, and this account has none logged yet). Press Add food, then Quick add. Read Suggested now and Recent and favorites. Tap a food under Recent and favorites, press Log it, then Undo.',
    'Tap one suggestion under Suggested now.',
  ],
  expected: [
    '"Added Rice." shows under the toolbar and in the sheet; Rice is in today\'s eaten rows and the Calories and Protein meters rise.',
    'The portion sheet opens at the usual amount; Log it adds an entry and Undo removes only that entry.',
    'A suggestion adds one portion and says "Added <food>." (there is no Undo here: delete it from its eaten row).',
  ],
};

export default scenario;
