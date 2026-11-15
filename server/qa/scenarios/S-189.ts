import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-189', feature: 'Week board', title: 'The plate check and its one-tap fix', persona: 'meal-planner', brief: 'week-board',
  steps: [
    'With Chili and Rice paired (S-179), tap the name of a day after today (for example "Fri 25"), press Add food, pick Dinner, press Recipes and press Plan Chili for Dinner. Read the marks under Dinner on that day\'s column.',
    'Press the dashed "+ Add a carb" button.',
  ],
  expected: [
    'Dinner shows Protein, Carb and Veg marks; Protein has a check and Carb and Veg do not.',
    'The button reads "+ Add a carb: Rice (goes with Chili)". One tap puts Rice in Dinner and Carb gets a check. A Veg button appears only if you have a recipe that counts as Veg (a recipe in Sides, or one set to count as Veg); with the starter recipes there is none: add a food by hand called Steamed broccoli (50 kcal, 4 g protein) with the Veg chip on, and a "+ Add a veg: Steamed broccoli" button then appears and gives Veg its check.',
  ],
};

export default scenario;
