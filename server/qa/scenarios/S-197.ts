import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-197', feature: 'Nutrition board', title: 'With no target a meter shows the amount and never turns red', persona: 'diet-fresh', brief: 'nutrition-board', edge: true,
  steps: [
    'On Nutrition read today\'s meters. This account has no targets saved.',
    'Press Add food, One-off food, add "Rice" 300 kcal and 20 g protein, then Done.',
    'Press Manage, type 2,200 into Calories (set a goal weight first if the field is not offered) and press Done.',
  ],
  expected: [
    'Before and after Rice, Calories reads "300 kcal" with no "/ target" and the bar is not red; a screen reader adds "no target set".',
    'Once Calories is 2,200 the meter reads "300 / 2,200 kcal".',
    'Water still has a goal (half the body weight, or 64 oz with no weight), whatever the diet targets say.',
  ],
};

export default scenario;
