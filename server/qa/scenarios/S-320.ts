import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-320', feature: 'Nutrition meal labels and repeat', title: 'A drink recipe lands in the day\'s Drinks list', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat',
  steps: [
    'In Recipes start a new recipe named "Cold brew" with an ingredient. In the Used as row press Drink.',
    'Check that there is no separate Beverage row, then press Save recipe.',
    'In Nutrition pick a day after today that has no drink, open its add sheet and press Plan on Cold brew.',
    'Close the sheet and look under the day\'s meals.',
  ],
  expected: [
    'After pressing, the Drink chip in Used as is pressed, and the form has no separate Beverage switch.',
    'The add sheet shows "Planned Cold brew" followed by a meal name.',
    'A Drinks section shows Cold brew with its kcal and the line "Not in the plate check or the 8-item limit." Cold brew is not inside Breakfast, Lunch, Dinner or Snack.',
  ],
};

export default scenario;
