import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-321', feature: 'Nutrition meal labels and repeat', title: 'No Drinks section until a drink is planned, and it goes when Drink is turned off', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat', edge: true,
  steps: [
    'In Nutrition look at a day after today that has no drink planned.',
    'In Recipes make "Cold brew" a drink (press Drink in Used as), save it, and plan it on that day from the add sheet.',
    'Open Recipes, open Cold brew, open More actions, press Edit, press Meal in Used as so Drink is off, and press Save recipe.',
    'Open Nutrition and look at that day again.',
  ],
  expected: [
    'Before any drink is planned the day has no Drinks section at all.',
    'With the drink planned a Drinks section shows Cold brew.',
    'After Drink is turned off the Drinks section is gone and Cold brew sits in one of the meals instead.',
  ],
};

export default scenario;
