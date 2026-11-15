import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-199', feature: 'Nutrition board', title: 'The add sheet picks the meal from the time, and remembers your pick', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Use a private window (or a browser that has never opened the add sheet), sign in as this account, open Nutrition and press Add food on today. Press Done.',
    'Tap the name of a day after today (for example "Fri 25") and press Add food. Read which button under Which meal? is pressed. Press a different one and press Done.',
    'Tap the day name again and press Add food again.',
  ],
  expected: [
    'On today the sheet shows no Which meal? question (eaten food has no meal); the title is "Add food" and under it reads "Adding to <today> · today".',
    'On the day ahead, before 10:30 Breakfast is pressed; to 14:30 Lunch; to 16:30 Snack; to 21:30 Dinner; after that Snack. The note under the meal buttons says "Recipes and saved meals you add go into <meal>."',
    'The second time the sheet opens on a day ahead it shows the meal you picked, whatever the time. (The pick is kept in this browser only.)',
  ],
};

export default scenario;
