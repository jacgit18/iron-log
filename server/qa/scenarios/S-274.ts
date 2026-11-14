import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-274', feature: 'Scan keeps its day', title: 'A scanned food is logged to the day the scan began on', persona: 'meal-planner', brief: 'nutrition-board', device: true,
  steps: [
    'On a phone, open Nutrition and select yesterday (not today).',
    'Scan a food with the camera (a barcode or a label) and wait for the scanned-food panel. If the app lets you change the day while the panel is open, change it to today; if not, note that and carry on.',
    'Press Save and log it, then look at both yesterday and today.',
  ],
  expected: [
    'The food is logged to yesterday, the day the scan began on, not to whichever day was selected when Save and log it was pressed; today shows no new entry.',
  ],
};

export default scenario;
