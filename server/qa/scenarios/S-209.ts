import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-209', feature: 'Nutrition board', title: 'Last week logs food on its date; supplements and water change too', persona: 'diet-on-target', brief: 'nutrition-any-day-add', edge: true,
  steps: [
    'Press the previous-week arrow and read a day: its meters, its eaten food (Not in a meal) and its other sections.',
    'Tap a day name there, read the toolbar, press Add food and add a one-off food. Tap its row and read the sheet.',
    'Tick a supplement on that day (add one first in Manage, S-210) and press + Drink, then press a size.',
  ],
  expected: [
    'The day shows its eaten food under Not in a meal (an earlier day\'s food has no meal) and its meters count that day\'s food.',
    'The toolbar offers Add food and Scan and log; the food is logged on that date (in "Not in a meal"), counted in that day\'s meters, and its row sheet offers Edit, Delete, Move to… and Copy to…. There is no "food is read-only" line.',
    'The tick and the drink both save, and that day\'s count and Water meter move.',
  ],
};

export default scenario;
