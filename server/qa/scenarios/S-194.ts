import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-194', feature: 'Nutrition board', title: 'Weeks run Sunday to Saturday; the arrows step a week and This week returns to today', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'On Nutrition read the first and last day names of This week (Sunday to Saturday, like the Board).',
    'Press the previous-week arrow and read its first and last day names and the line under the arrows.',
    'Press the next-week arrow twice and read the same, then press This week.',
  ],
  expected: [
    'This week runs Sunday to Saturday and today\'s column is inside it. Each arrow press moves exactly one such week.',
    'No day appears in two weeks; the line under the buttons follows (for example "Last week · Sep 17 to 23").',
    'This week returns to the current week and the toolbar reads "Adding to <today> · today" again.',
  ],
};

export default scenario;
