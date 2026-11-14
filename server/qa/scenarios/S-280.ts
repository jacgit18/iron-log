import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-280', feature: 'Week to Shopping', title: 'An item already eaten adds nothing', persona: 'meal-planner', brief: 'week-shopping', edge: true,
  steps: [
    'Press Reset on Meal planner first (switch to another account to do it), then switch back. Baked salmon is the one seeded recipe planned on a single day, so plan it for today: move its card from its day (three days ahead) to today, then tick it as eaten. The other recipes are planned on two days each, so ticking one of them still leaves it needed on its other day.',
    'Read Add missing to Shopping.',
  ],
  expected: [
    'The ticked item is skipped: with nothing else planned the button is dimmed, and a tap with other planned recipes adds only their ingredients (none of Baked salmon\'s own: Salmon, Sweet potatoes, Lemon; Olive oil is still added because Egg and spinach scramble, planned for today, needs it too).',
  ],
};

export default scenario;
