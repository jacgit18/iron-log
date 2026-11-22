import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-198', feature: 'Nutrition board', title: 'The toolbar names the day it adds to, and follows the day you tap', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'On Nutrition read the line beside Add food and the buttons next to it.',
    'Tap the name of a day after today (for example "Sat 26") in its column.',
    'Press the previous-week arrow, tap a day name there and read the toolbar again.',
  ],
  expected: [
    'It reads "Adding to <today> · today", and Scan and log sits beside Add food, which is the last button of the row.',
    'It reads "Adding to Sat 26"; only Add food is left (a day ahead plans, see S-207).',
    'Last week\'s day reads "Adding to <day>" and offers Add food and Scan and log like today (Quick add and One-off food are in the Add food menu); they log eaten food on that date (S-209). There is no "food is read-only" line.',
  ],
};

export default scenario;
