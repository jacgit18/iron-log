import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-186', feature: 'Counts as', title: 'Counts as on a plate: automatic until you press, then your choice', persona: 'recipe-collector', brief: 'week-board',
  steps: [
    'Open + New, Recipe or meal, set the category to Protein and read Counts as on a plate. Press Veg.',
    'Save, open it again with Edit, then press Back to automatic.',
    'On + New, Add a food, type 30 g protein and read Counts as.',
    'Open Lentil soup (this account has it set by hand) and press Edit.',
  ],
  expected: [
    'Protein is on to begin with. Pressing Veg adds it and a dashed Back to automatic chip appears. Your choice is still there after Save and Edit.',
    'Back to automatic returns to Protein only. A food with 30 g protein counts as Protein, and the last chip cannot be turned off.',
    'Lentil soup opens with Protein and Carb on and the dashed Back to automatic chip showing (a hand-set choice).',
  ],
};

export default scenario;
