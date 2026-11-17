import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-318', feature: 'Nutrition meal labels and repeat', title: 'The add sheet pre-picks a food\'s usual meal until you press a meal', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat',
  steps: [
    'In Recipes make a recipe named "Oatmeal" with the Usual meal Breakfast and save it. Make a second recipe named "Rice" and leave the Usual meal on None.',
    'Open Nutrition, pick a day after today and open its add sheet (Add food).',
    'Read the line under the meal buttons. Find the Plan buttons for Oatmeal and Rice in the recipe list.',
    'Press Plan on Oatmeal. Then press Dinner in the meal buttons and press Plan on Oatmeal again.',
  ],
  expected: [
    'Before any meal is pressed the line reads "A recipe goes into its usual meal; one without goes into" followed by a meal, then "Press a meal to put everything there."',
    'The Oatmeal button is named "Plan Oatmeal for Breakfast"; the Rice button names the sheet\'s own starting meal.',
    'The first Plan shows "Planned Oatmeal for Breakfast."',
    'After pressing Dinner the line reads "Recipes and saved meals you add go into Dinner." and the button reads "Plan Oatmeal for Dinner"; pressing it shows "Planned Oatmeal for Dinner." The day then holds Oatmeal in Breakfast and in Dinner.',
  ],
};

export default scenario;
