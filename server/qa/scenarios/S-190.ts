import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-190', feature: 'Week board', title: 'Move a card to another meal or day, and drag on a wide screen', persona: 'meal-planner', brief: 'week-board', edge: true,
  steps: [
    'Tap a card, press Move to… and pick Lunch. Tap it again, press Move to… and pick another day.',
    'On a wide screen drag a card into another meal.',
    'Try to move a card to a day that already holds 8 planned items (cards marked planned with Plan; move a planned card there), and into a meal that already has the same food (then into another meal of that day that has it).',
  ],
  expected: [
    'The card moves to the meal or the day you picked and the bars of both days follow. A food already in that meal is refused with "That is already in that meal."; the same food in another meal of that day is allowed, as adding it is.',
    'Dragging does the same.',
    'A day with 8 planned things refuses a planned card with "A day can hold 8 planned things. Unplan one to plan another."; a card not marked planned moves there, up to 40 things a day, not counting drinks and daily snacks ("A day can hold 40 things, not counting drinks and daily snacks. Remove one to add another.").',
  ],
};

export default scenario;
