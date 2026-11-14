import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-211', feature: 'Nutrition board', title: 'The drink sheet adds every size, another amount, and Remove with Undo', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'On today\'s Hydration press + Drink. Read the title and the totals.',
    'Press a size, then type 12 in Other amount (oz) and press Add.',
    'Under Logged press Remove on the 12 oz drink, press Tap again to remove, then Undo.',
    'Type 500 in Other amount (oz) and press Add. Press Done.',
  ],
  expected: [
    'The title reads "Hydration · <day> · today"; nine "Add water by container size" buttons (each "+n oz" with its name and cups); the total reads "n / goal oz", the cups, and "n oz to go" or "goal met".',
    'Each drink appears under Logged; Remove asks "Tap again to remove", the drink goes, and Undo brings it back in the same place.',
    '500 is refused with "Enter ounces, up to 200"; after Done the board\'s Hydration line and Water meter match the sheet.',
  ],
};

export default scenario;
