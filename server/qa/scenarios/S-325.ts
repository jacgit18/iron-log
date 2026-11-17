import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-325', feature: 'Nutrition meal labels and repeat', title: 'Repeat a planned card on weekdays and see it in later weeks', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat',
  steps: [
    'Open Nutrition. On a day that is today or later, tap a planned card (a food in a meal) so its buttons open.',
    'Press "Repeat…". In the sheet titled Repeat followed by the food name, read the sentence, then press Weekdays.',
    'Press Repeat.',
    'Press the Next week arrow three times and look at Monday to Friday and at Saturday and Sunday.',
  ],
  expected: [
    'The sheet shows Every day and Weekdays buttons and the days M, T, W, T, F, S, S as ticks; Weekdays is pressed and Monday to Friday are ticked.',
    'A sentence under the days reads "Weekdays in <meal>, every week from <day> for the next 52 weeks. Nothing is copied: change or stop it here."',
    'The sheet closes and the status line reads "<food> repeats on weekdays."',
    'Three weeks on, the food shows in the same meal on Monday to Friday and not on Saturday or Sunday.',
  ],
};

export default scenario;
