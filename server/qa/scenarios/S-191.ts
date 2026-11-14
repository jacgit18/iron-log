import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-191', feature: 'Week board', title: 'The Fat bar says when some foods have no fat figure', persona: 'meal-planner', brief: 'week-board', edge: true,
  steps: [
    'On a day after today plan Baked salmon (it has a fat figure) and Black bean rice (it has none: Meal planner seeds it for this scenario) with Add food, Recipes, Plan. Read the Fat meter.',
    'Add more portions of Black bean rice until it makes up most of the day\'s calories.',
  ],
  expected: [
    'With a few foods missing fat the meter is hatched and a line says "Fat: n of m foods have it." and it never turns red.',
    'When most of the day has no fat figure the bar is replaced by "Add fat to your foods to see fat here."',
  ],
};

export default scenario;
