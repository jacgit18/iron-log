import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-287', feature: 'Daily snacks', title: 'Save a daily snack list; it shows every day, and ticking or skipping changes one day', persona: 'meal-planner', brief: 'daily-snacks',
  steps: [
    'On Nutrition read today\'s Snack section, then press Set up daily snacks. Press Add snack, pick Overnight oats, press Back to the list, step its portion up once and press Done.',
    'Read Snack on today and on a day later in the week. Reload and read Snack again.',
    'Tick the Overnight oats snack on today. Read tomorrow\'s Snack.',
    'On a day later in the week press Skip today on the snack and press Tap again to skip. Read that day and the day after it.',
    'Open Daily snacks, press Remove beside the snack and press Tap again to remove.',
  ],
  expected: [
    'Before setup Snack sits after Dinner and says "No daily snacks yet". The sheet says "No daily snacks yet. Add the ones you always buy and eat." and, once saved, lists the snack with its calories and "× 1.5".',
    'The snack shows in Snack on every day from today to two weeks ahead with nothing copied into each day, and it is still there after the reload.',
    'Today\'s snack is ticked and the day\'s Calories meter moves; tomorrow\'s copy is unticked.',
    'The snack is gone from that one day only; the day after still shows it and the list is unchanged.',
    'The snack leaves the list and no day shows it any more. Anything already ticked eaten stays in the log.',
  ],
};

export default scenario;
