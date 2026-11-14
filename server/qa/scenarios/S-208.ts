import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-208', feature: 'Nutrition board', title: 'Edit and delete an eaten food from its row sheet; carbs and fat survive an edit', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'In today\'s eaten rows tap the Greek yogurt row, press Edit in its sheet, change only the name to "Plain yogurt" and press Save.',
    'Read the Fat meter before and after.',
    'Tap the Plain yogurt row, press Delete and then Tap again to delete. Then tap an earlier day\'s eaten row and read its sheet.',
    'Add a one-off food with only a name, calories and protein, and read the line under the eaten rows.',
  ],
  expected: [
    'The row shows "Plain yogurt"; Calories, Protein and Fat meters do not change, because the edit kept its carbs and fat.',
    'The first Delete tap only changes the button to "Tap again to delete"; the second removes the row and lowers the meters by that food\'s numbers. An earlier day\'s row opens the same sheet with Edit, Delete, Move to… and Copy to….',
    'A line says "Carbs and fat count only what you enter." once a food has no carbs or fat.',
  ],
};

export default scenario;
