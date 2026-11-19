import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-207', feature: 'Nutrition board', title: 'A day ahead plans recipes and saved meals; it never logs', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Next week and pick a day whose Breakfast, Lunch and Dinner all say "Nothing planned" (the seed plans seven days from today, so days later than that are empty). Note that Snack is listed after Dinner.',
    'Tap that day\'s name, press Add food, pick Snack, press Recipes. Read the buttons beside each recipe.',
    'Press Plan on Overnight oats. Press Done.',
    'Press This week and tap today\'s name; press Add food and Recipes.',
  ],
  expected: [
    'Breakfast, Lunch and Dinner say "Nothing planned" and have no button; Snack says "No daily snacks yet" (no daily snacks are saved).',
    'The note reads "Recipes and saved meals you add go into Snack."; each recipe has only Plan (no Log). The notice reads "Planned Overnight oats for Snack."',
    'The Snack section now holds an Overnight oats card, and that day\'s Calories meter reads its planned calories. Today\'s recipes list has only Log (no Plan), and today\'s add sheet shows no Which meal? question.',
  ],
};

export default scenario;
