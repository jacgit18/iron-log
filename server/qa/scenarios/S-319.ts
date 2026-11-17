import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-319', feature: 'Nutrition meal labels and repeat', title: 'Changing a usual meal moves every copy placed by default, not the one you placed', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat', edge: true,
  steps: [
    'In Recipes make "Oatmeal" with the Usual meal Breakfast.',
    'In Nutrition open the add sheet for two different days after today and press Plan on Oatmeal on each (the sheet\'s Plan button names Breakfast). On a third day press Dinner first, then Plan on Oatmeal, so that copy is placed by hand.',
    'Back in Recipes open Oatmeal, open More actions, press Edit, press Snack in the Usual meal row and press Save recipe.',
    'Open Nutrition and look at the three days.',
  ],
  expected: [
    'The two days where you used the default now show Oatmeal under Snack and nothing under Breakfast.',
    'The day where you pressed Dinner first still shows Oatmeal under Dinner.',
    'The Oatmeal card reads "Usual meal: Snack".',
  ],
};

export default scenario;
