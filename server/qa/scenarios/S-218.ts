import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-218', feature: 'Nutrition board', title: 'Manage: supplements and library, Water reminder', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Manage and read its rows.',
    'Press Supplements and library, add a supplement under Noon, press Back to Manage and then Done.',
    'Press Manage and press Water reminder (under the water goal); then press Back.',
  ],
  expected: [
    'The rows read Water reminder and Supplements and library, each with a one-line note; there is no Meals and foods row (Recipes is the button at the top of the screen).',
    'The editor shows the Morning, Noon and Night editor and the whole library; the new supplement appears on every day\'s Supplements.',
    'Water reminder closes the sheet and opens Settings (the reminder is under Alerts). Back should return to Nutrition (checked by an automated test; not yet walked by hand, so record what you see).',
  ],
};

export default scenario;
