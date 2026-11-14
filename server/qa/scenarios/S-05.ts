import type { Scenario } from '../scenarios.ts';

// ---- Saved meals ----
const scenario: Scenario = {
  id: 'S-05', feature: 'Saved meals', title: 'Plan a saved meal for a day ahead', persona: 'meal-planner', brief: 'diet-saved-meals',
  steps: [
    'Open Daily, Nutrition and tap the name of a day after today (for example "Fri 25") so the toolbar reads "Adding to Fri 25".',
    'Press Add food, pick Lunch under Which meal?, press Saved meals and tap "Usual breakfast".',
    'Open Recipes, press Meals, open the meal and rename it "Weekday breakfast" from Edit. Open Nutrition again, press Add food on that day and press Saved meals.',
  ],
  expected: [
    'A day ahead plans, it does not log: the notice reads "Planned Usual breakfast for Lunch." and the meal appears under Lunch on that day. On today the same list logs the meal\'s foods as entries instead (S-202).',
    'The rename is made in Recipes (there is no Manage button) and shows in Saved meals. See S-183 to S-185.',
  ],
};

export default scenario;
