import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-289', feature: 'Daily snacks', title: 'Add missing to Shopping includes the listed daily snacks', persona: 'meal-planner', brief: 'snacks-into-shopping',
  steps: [
    'Press Reset on Meal planner first (switch to another account to do it), then switch back. Save one daily snack whose recipe has an ingredient that is not at home and not on Shopping, and plan nothing else that needs it.',
    'Press Add missing to Shopping (toolbar on a wide screen; on a phone press Add to Shopping in the bar above the day). Open Shopping.',
    'Skip the snack on every day shown, and press Add missing to Shopping again. Then tick the snack on today and press it once more.',
  ],
  expected: [
    'The button (on a phone, the bar) is there although only a snack is missing something. The notice reads "Added n to Shopping" with Undo, and Shopping lists the snack\'s missing ingredient once, however many days show the snack.',
    'Shopping shows each ingredient once and nothing already at home or already on the list.',
    'With the snack skipped on every day the button adds nothing (on a phone the bar is gone); a snack already ticked eaten on a day is not counted again from that day.',
  ],
};

export default scenario;
