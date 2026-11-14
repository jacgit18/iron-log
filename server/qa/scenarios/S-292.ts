import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-292', feature: 'Joined week and day tabs', title: 'Nutrition on a phone: week switcher and seven day tabs in the card, Manage at the right', persona: 'meal-planner', brief: 'week-day-joined-tabs',
  steps: [
    'On a phone (375 px wide) open Nutrition. Read the top, then tap Fri.',
    'Press Next week, read the selected day, then tap Sat. Press Previous week twice, then This week.',
    'Read the row under the add-food buttons.',
  ],
  expected: [
    'One card holds the week switcher and Sun to Sat with the date numbers, today marked and selected; there is no day dropdown and no Previous day or Next day buttons. Tapping Fri shows Fri and the toolbar says "Adding to Fri".',
    'Next week selects its first day; Last week selects its first day; This week goes back to today. Each week shows its own seven days.',
    'Manage is a text link at the right end of its row.',
  ],
};

export default scenario;
