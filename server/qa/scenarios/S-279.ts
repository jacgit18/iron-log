import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-279', feature: 'Week to Shopping', title: 'The button is off when there is nothing to add, and last week adds nothing', persona: 'meal-planner', brief: 'week-shopping', edge: true,
  steps: [
    'On a day with nothing planned, read the button (toolbar on a wide screen; on a phone look for the bar above the day). Then plan a recipe whose ingredients are all at home or already on Shopping and read it again.',
    'Pick a day in last week (the day dropdown on a phone, Last week on a wide screen) and read the button again.',
  ],
  expected: [
    'Add missing to Shopping is dimmed with nothing to add (on a phone no bar is drawn), and turns on (the bar appears) when a planned recipe has an ingredient that is not at home or on the list.',
    'On last week the button is gone from a wide screen\'s toolbar and no bar is drawn on a phone (it adds nothing there).',
  ],
};

export default scenario;
