import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-282', feature: 'Move and copy eaten', title: 'Copy an eaten food to another day', persona: 'diet-on-target', brief: 'nutrition-move-copy-eaten',
  steps: [
    'In today\'s Also eaten list tap the Greek yogurt row and press Copy to…. Read the days offered.',
    'Pick an earlier day. Read the message, then that day\'s column and today\'s list.',
    'Tap the copy on that earlier day and read its sheet.',
  ],
  expected: [
    'Today and earlier days are offered, never the food\'s own day and never a day ahead.',
    'A sentence says "Added 1 from Greek yogurt." The original stays in today\'s list. The copy shows on the earlier day under "Not in a meal" with the same calories, protein, carbs and fat, and that day\'s meters rise by the same amount.',
    'The copy\'s sheet offers Edit, Delete, Move to… and Copy to… like any eaten row.',
  ],
};

export default scenario;
