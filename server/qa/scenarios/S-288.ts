import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-288', feature: 'Daily snacks', title: 'A daily snack can still be ticked on a day that holds 8 planned things', persona: 'meal-planner', brief: 'snacks-day-cap', edge: true,
  steps: [
    'Save one daily snack (S-287 step 1). On a day later in the week plan recipes and saved meals into Breakfast, Lunch and Dinner until the day holds 8 planned things outside Snack, then try a ninth.',
    'Tick the daily snack on today after filling today the same way, or move the snack\'s card to another day in Snack.',
    'Move a card from Snack into Dinner on that full day.',
  ],
  expected: [
    'The eighth planned thing is added and the ninth is refused with a notice; nothing extra is added. The listed snack still shows in Snack.',
    'The snack ticks (or moves) normally and is never refused for a full day; it does not count toward the 8.',
    'Moving it into Dinner counts it as planned there, so on a full day that move is refused and the snack stays in Snack.',
  ],
};

export default scenario;
