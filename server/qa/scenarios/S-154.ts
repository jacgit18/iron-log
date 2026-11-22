import type { Scenario } from '../scenarios.ts';

// ---- Nutrition quick log ----
const scenario: Scenario = {
  id: 'S-154', feature: 'Nutrition quick log', title: 'Log a recent food from Quick add with the portion sheet and Undo', persona: 'recipe-collector', brief: 'nutrition-quick-log',
  steps: [
    'Open a recipe that has calories and protein, press Ate this once, then open Daily, Nutrition, press Add food, then Quick add, and look under Recent and favorites. Press the food, press Less once, then Log it, and press Undo.',
  ],
  expected: [
    'Recent and favorites lists the food. The sheet opens at the usual amount (1 portion if none is set), Less lowers it by a half and the numbers change with it. Log it says Logged ... to today with an Undo, and Undo removes only that entry.',
  ],
};

export default scenario;
