import type { Scenario } from '../scenarios.ts';

// ---- Meal planner ----
const scenario: Scenario = {
  id: 'S-07', feature: 'Meal planner', title: 'Read a planned day and change a portion', persona: 'meal-planner', brief: 'diet-meal-planner',
  steps: [
    'Open Daily, Nutrition and read the seven days of This week (on a phone step through them with the day stepper). Look at the meals of a day after today that has a recipe and a meal planned.',
    'Tap the recipe\'s card, press More and raise the portions.',
    'Tap the card again, press Remove and press Tap again to remove (the first tap only arms it).',
  ],
  expected: [
    'Each day lists its planned items under Breakfast, Lunch, Dinner and Snack, and a day ahead shows its planned calories, protein and fat as one muted "Planned: ..." line under its meters, whose bars read 0 against the 2,400 / 160 targets until food is eaten (ADR 126).',
    'Raising the portion raises that day\'s "Planned:" line; removing the recipe lowers it. The bars do not move. (Today\'s meters count only what was eaten: S-196.)',
  ],
};

export default scenario;
