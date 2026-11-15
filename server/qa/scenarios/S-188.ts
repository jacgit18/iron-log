import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-188', feature: 'Week board', title: 'A day as four meals with Calories, Protein and Fat bars', persona: 'meal-planner', brief: 'week-board',
  steps: [
    'On Nutrition look at a day after today that has planned items (a phone: use the day stepper). Read the meters at the top and the meals under them.',
    'Tap that day\'s name, press Add food, pick Dinner, press Recipes and press Plan on a recipe. Tap its card and press More.',
  ],
  expected: [
    'A day ahead shows Calories, Protein and Fat bars at 0 against 2,400 kcal and 160 g, and a muted "Planned: ..." line under them with the totals of its planned items; each meal (Breakfast, Lunch, Dinner, Snack) shows its calories against its share of the day. Planned items from before meals existed sit under Not set.',
    'The added recipe appears in that meal and the "Planned:" line changes; More raises that card\'s portion and the line with it. The bars stay at 0 on a day ahead; on today or an earlier day a bar over its target fills in full in orange and its label says how many grams over (for example "Fat eaten so far: 108.5 / 70 g, 38.5 g over").',
  ],
};

export default scenario;
