import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-213', feature: 'Nutrition board', title: 'A day ahead sets its water goal and logs no drinks', persona: 'diet-on-target', brief: 'nutrition-board', edge: true,
  steps: [
    'On a day after today press + Drink under Hydration.',
    'Look for the size buttons and Other amount. Tick Hot day. Press Done and reload the page.',
  ],
  expected: [
    'The sheet says "This day has not happened yet. Set the goal ahead; drinks are logged on the day." and has no size buttons, no Other amount and no Logged list.',
    'The day\'s Hydration reads "Goal <n> oz" with the tag "Hot day +16"; after the reload it is still there.',
  ],
};

export default scenario;
