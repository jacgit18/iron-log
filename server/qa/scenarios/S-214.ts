import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-214', feature: 'Nutrition board', title: 'On a phone: one day at a time under seven day tabs, and no sideways scroll', persona: 'diet-on-target', brief: 'nutrition-board', edge: true,
  // Rewritten 2026-11-13: the phone's Previous day / Day to show / Next day stepper became seven day tabs in one card (PRs 968, 973, S-292); the limits are now one week each way (WEEK_OFFSETS in src/lib/nutritionBoard.ts).
  steps: [
    'Emulate a 375 px wide window and open Nutrition.',
    'Tap each of the seven day tabs in turn, then press Next week and tap two of its tabs, then press Previous week twice (last week is as far back as the board goes) and look at the arrows.',
    'Scroll the page sideways and look at the card, the add-food row and the day.',
    'Read the height of the day tabs and of every button in the add-food row.',
  ],
  expected: [
    'One day shows under the card, and the tab you tapped is the selected one; the day it names is the day food is added to (on a phone the "Adding to" line is read by a screen reader but not drawn).',
    'Each week shows its own seven days. The board has last week, this week and next week only: Previous week is dimmed on last week and Next week on next week; Next week selects its first day.',
    'There is no sideways scroll, and every day tab and every button is at least 44 px tall.',
  ],
};

export default scenario;
