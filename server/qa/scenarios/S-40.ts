import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-40', feature: 'Wide layouts', title: 'Nutrition as seven day columns, one day with a stepper below 1280 px', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'Open Daily, Nutrition at 1920 px and at 1279 px.',
  ],
  expected: [
    'From 1280 px the week is seven day columns side by side, each with its meters, meals with their eaten food, Supplements and Hydration; below it one day shows with the day stepper (Previous day, Day to show, Next day). The old Diet, Supplements, Water and Last 7 days panels are gone.',
  ],
};

export default scenario;
