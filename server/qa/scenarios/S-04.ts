import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-04', feature: 'Goal calories and pace', title: 'Fast pace is held at the limit; a typed number wins', persona: 'diet-fresh', brief: 'diet-macros-and-goal-calories', edge: true,
  steps: [
    'In Manage, with a goal weight set below the latest weight (see S-03), pick Fast.',
    'Type 3,000 into Calories.',
    'Reload the page.',
    'Press Use recommended.',
  ],
  expected: [
    'A pace that would cut more than the advised amount is held at the limit and the card says so.',
    'Typing 3,000 replaces the calories only; protein, fat and carbs stay as recommended or follow the typed values; it survives the reload.',
    'Use recommended clears the typed numbers and keeps the pace.',
  ],
};

export default scenario;
