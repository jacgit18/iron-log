import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-283', feature: 'Move and copy eaten', title: 'Move an eaten food to another day, undo it, and hit the daily limit', persona: 'diet-on-target', brief: 'nutrition-move-copy-eaten', edge: true,
  steps: [
    'Tap the Greek yogurt row on today, press Move to… and pick an earlier day. Read the notice, then both days\' lists.',
    'Press Undo on the notice and read both days\' lists again.',
    'Add one-off foods to an earlier day until it holds 20, then copy a food from today to that day.',
  ],
  expected: [
    'The notice reads "Moved Greek yogurt to <day>." with Undo. The food leaves today\'s list and appears on that day; both days\' meters follow.',
    'Undo puts the original back on today and takes the moved copy away: nothing is doubled and no other entry changes.',
    'The copy is refused with "You can log 20 things a day." and nothing is added.',
  ],
};

export default scenario;
