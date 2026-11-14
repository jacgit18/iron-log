import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-218', feature: 'Nutrition board', title: 'Manage: supplements and library, Meals and foods (opens Recipes), Water reminder', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Manage and read its rows.',
    'Press Supplements and library, add a supplement under Noon, press Back to Manage and then Done.',
    'Press Manage, Meals and foods (opens Recipes); then press Back, press Manage and press Water reminder (under the water goal).',
  ],
  expected: [
    'The rows read Water reminder, Supplements and library and Meals and foods (opens Recipes), each with a one-line note.',
    'The editor shows the Morning, Noon and Night editor and the whole library; the new supplement appears on every day\'s Supplements.',
    'Meals and foods (opens Recipes) closes the sheet and opens Recipes; Water reminder opens Settings (the reminder is under Alerts). Back from either should return to Nutrition (expected from the code; not yet walked by hand, so record what you see).',
  ],
};

export default scenario;
