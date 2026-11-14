import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-14', feature: 'Auto macros', title: 'Search past meals and recipes, with a portion stepper', persona: 'meal-planner', brief: 'diet-auto-macros',
  steps: [
    'Press Add food, then Find food. In the "Search your past meals and recipes" box type "oat".',
    'Pick Overnight oats, set the portion to 1.5, and press Add.',
  ],
  expected: [
    'Matching foods you logged before and your own recipes that have calories and protein are listed newest first, at most six, with their numbers.',
    'The portion stepper (0.5 to 10) scales the numbers; Add logs them; the recipe entry keeps its recipe link.',
  ],
};

export default scenario;
