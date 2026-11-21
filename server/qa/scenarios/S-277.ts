import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-277', feature: 'Week to Shopping', title: 'Add missing to Shopping puts the week\'s missing ingredients on the list once', persona: 'meal-planner', brief: 'week-shopping',
  steps: [
    'Press Reset on Meal planner first (switch to another account to do it), then switch back. On Nutrition, plan two recipes that share an ingredient on days ahead (Add food, Recipes, pick the meal).',
    'Press Add missing to Shopping (in the toolbar on a wide screen; on a phone press Add to Shopping in the bar above the day), then open Shopping.',
  ],
  expected: [
    'A notice reads "Added n to Shopping" (with "; m already there" when an ingredient was needed twice) and has an Undo button; on a phone the bar goes once everything is on the list, and Undo brings it back.',
    'Shopping lists each missing ingredient once; an ingredient already at home or already on the list is not added again.',
  ],
};

export default scenario;
