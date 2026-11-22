import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-281', feature: 'Add food any day', title: 'Tap an earlier day and log what you ate on it', persona: 'diet-on-target', brief: 'nutrition-any-day-add',
  steps: [
    'Open Daily, Nutrition. On a phone use the day stepper; on a wide screen tap the name of an earlier day this week (or in last week). Read the line beside + Add food.',
    'Press + Add food, One-off food, enter "Toast", 120 kcal and 4 g protein, and press Add. Read the message and the day\'s column.',
    'Tap today\'s name, then reload the page.',
    'Tap the name of a day after today and press + Add food.',
  ],
  expected: [
    'The toolbar reads "Adding to <that day>" and offers + Add food and Scan and log, as it does on today.',
    'One sentence says "Added Toast." The food shows in that day\'s "Not in a meal" list and that day\'s Calories and Protein meters rise by 120 kcal and 4 g; today\'s meters do not move.',
    'Reload opens on today (the address is unchanged by the picked day).',
    'A day ahead lists only Recipes and Saved meals, which plan items (S-200).',
  ],
};

export default scenario;
