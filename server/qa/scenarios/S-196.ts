import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-196', feature: 'Nutrition board', title: 'Meters count the plan for days ahead, and today\'s plan counts only once logged', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'On Nutrition note today\'s Calories meter and the planned items under today\'s meals (the seed plans two under Not set).',
    'Tick the check box of one of today\'s planned items (Check <name> as eaten).',
    'Look at a day after today that has planned items: add up the calories of its cards and compare with its "Planned:" line; its Calories meter reads 0.',
  ],
  expected: [
    'Before logging, today\'s Calories meter counts only the eaten rows of food nobody planned (about 35% of 2,400 kcal), not the planned items.',
    'After the check, the item shows its check in its meal (it is not listed again as a separate eaten row) and the meter rises by that item\'s calories.',
    'A day ahead\'s "Planned:" line reads the sum of its planned items; its Calories meter reads 0 of 2,400 kcal and a screen reader says "eaten so far", never "planned" (ADRs 105, 126).',
  ],
};

export default scenario;
