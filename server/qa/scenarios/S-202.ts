import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-202', feature: 'Nutrition board', title: 'Log with Find food, Saved meals and Recipes', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Add food, Find food, type "oat" in "Search your past meals and recipes", pick a result and press Add.',
    'Press Back to ways of adding, then Saved meals, and tap "Usual breakfast".',
    'Press Back to ways of adding, then Recipes. Type a few letters in Find a recipe and press Log on one recipe. Then tap the name of a day after today, press Add food, Recipes, and press Plan on a recipe.',
  ],
  expected: [
    'The food is added ("Added 1 portion of <food>.") and listed under Eaten.',
    'Usual breakfast logs two entries (the scramble and the oats); today\'s meters follow.',
    'On today a recipe has only Log, which opens the portion sheet (there is no Plan on today). On the day ahead Plan says "Planned <recipe> for <meal>." and the recipe appears in that meal on that day\'s column.',
  ],
};

export default scenario;
