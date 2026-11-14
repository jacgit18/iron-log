import type { Scenario } from '../scenarios.ts';

// ---- Diet targets and log ----
const scenario: Scenario = {
  id: 'S-01', feature: 'Diet targets and log', title: 'Read today and add a one-off food', persona: 'diet-on-target', brief: 'diet-targets-and-log',
  steps: [
    'Open Daily, Nutrition and find today\'s column (its name ends "· today"). Read its Calories and Protein meters and its eaten rows.',
    'Press Add food, then One-off food, enter "Rice", 200 kcal and 4 g protein, and press Add. Press Done.',
    'In today\'s eaten rows tap the Rice row, press Edit in its sheet, change the calories to 250 and press Save, then tap the row again, press Delete and press Tap again to delete.',
    'Read yesterday\'s column, the one just before today\'s (on a phone press Previous day; if today is a Sunday, press the previous-week arrow first).',
  ],
  expected: [
    'Before adding: the eaten rows holds three foods and the meters read "1,440 / 2,400 kcal" and "58 / 160 g".',
    'Adding Rice moves the totals by 200 kcal and 4 g; editing and deleting move them again; the total returns to where it began.',
    'Yesterday shows its own full day of five foods under Not in a meal, not today\'s; its rows open the same row sheet as today\'s (an earlier day can be corrected: S-209).',
  ],
};

export default scenario;
