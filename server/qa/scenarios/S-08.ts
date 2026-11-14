import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-08', feature: 'Meal planner', title: 'Tick the plan to log it; later days have no check box', persona: 'meal-planner', brief: 'diet-meal-planner', edge: true,
  steps: [
    'On today\'s column, tick the check box beside today\'s planned recipe (Check <name> as eaten).',
    'Tick the check box beside today\'s planned meal.',
    'Look at the cards of a day after today.',
  ],
  expected: [
    'The recipe logs one entry with its numbers at the planned portion, shown as checked in its meal (the notice reads "Added 1 from <name>."), not listed again as a separate eaten row, and today\'s meters move. Unticking removes what it logged. A planned meal (it is a recipe in the plan now that saved meals live in Recipes) also logs one entry with its total; Quick add logs the same meal\'s linked foods one by one.',
    'Days after today have no check box.',
  ],
};

export default scenario;
