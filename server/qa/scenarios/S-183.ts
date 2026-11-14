import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-183', feature: 'Saved meals move', title: 'Old saved meals appear once in Recipes as meals', persona: 'meal-planner', brief: 'saved-meals-into-recipes',
  steps: [
    'Sign in to this account on QA and open Recipes. Press Meals.',
    'Open "Usual breakfast" and read its numbers and ingredients. Reload the page and look at Meals again.',
  ],
  expected: [
    'The four saved meals (Usual breakfast, Chicken bowl, Post-workout, Quick dinner) are meals in Recipes with the numbers they had.',
    'Usual breakfast lists Egg and spinach scramble and Overnight oats as linked parts (it was made from those two recipes); the other three list their foods by name with their saved totals. After a reload each is still there once, not twice.',
  ],
};

export default scenario;
