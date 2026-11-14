import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-279', feature: 'Week to Shopping', title: 'The button is off when there is nothing to add, and last week adds nothing', persona: 'meal-planner', brief: 'week-shopping', edge: true,
  steps: [
    'On a day with nothing planned, read the button (toolbar on a wide screen, Manage on a phone). Then plan a recipe whose ingredients are all at home or already on Shopping and read it again.',
    'Pick a day in last week (the day dropdown on a phone, Last week on a wide screen) and read the button again.',
  ],
  expected: [
    'Add missing to Shopping is dimmed with nothing to add, and turns on when a planned recipe has an ingredient that is not at home or on the list.',
    'On last week the button is gone from a wide screen\'s toolbar and dimmed in a phone\'s Manage sheet (it adds nothing there).',
  ],
};

export default scenario;
