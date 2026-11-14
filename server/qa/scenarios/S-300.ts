import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-300', feature: 'Meal vitamin bars', title: 'The vitamin bars start closed and go when the meal uses its own numbers', persona: 'meal-planner', brief: 'meal-micro-breakdown', edge: true,
  steps: [
    'Open a meal built from two foods that list vitamins (Cereal bowl). Read the line under its calories, without pressing anything.',
    'Edit the meal, open Nutrition per serving, and tick Use my own numbers. Untick it again.',
    'Open a recipe you typed by hand with no linked foods.',
  ],
  expected: [
    'One button reads "Vitamins and minerals: N listed" and no bars are showing.',
    'With Use my own numbers ticked the button is gone; unticked, it is back.',
    'The typed recipe has no vitamins button.',
  ],
};

export default scenario;
