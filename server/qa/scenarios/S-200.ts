import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-200', feature: 'Nutrition board', title: 'The ways of adding, and Back to ways of adding', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'On Nutrition press Add food and read the list of ways to add food.',
    'Press One-off food, then Back to ways of adding, then Quick add.',
    'Press Done. Tap tomorrow\'s name and press Add food again.',
  ],
  expected: [
    'Today lists seven ways in three groups, each with an icon and a one-line hint: Fastest (Quick add, Scan and log, One-off food), From what you have (Find food, Recipes) and Whole days and meals (Saved meals, Copy yesterday); once something is eaten that day, Save as a meal in Recipes joins the last group (S-203); every row starts at the same left edge.',
    'The sheet\'s title changes to the way you opened; Back to ways of adding returns to the list; Done closes the sheet.',
    'A day ahead lists only Recipes and Saved meals, under From what you have and Whole days and meals (food is eaten on the day; ahead it only plans).',
  ],
};

export default scenario;
