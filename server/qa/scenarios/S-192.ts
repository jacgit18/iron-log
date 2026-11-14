import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-192', feature: 'Week board', title: 'A saved meal planned earlier is still on the board after the move', persona: 'meal-planner', brief: 'week-board', edge: true,
  steps: [
    'On Nutrition find a day that had a saved meal planned and read the day\'s meals.',
    'Tap the item and press Move to… to put it in Dinner.',
  ],
  expected: [
    'The saved meal is on that day as its Recipes meal, in the Not set group at the top of the day, with the same calories.',
    'After Move to… it is in Dinner. The Not set group disappears once every item of that day has a meal.',
  ],
};

export default scenario;
