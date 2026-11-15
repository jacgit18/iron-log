import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-297', feature: 'Joined week and day tabs', title: 'Nutrition on a desktop: the week row and the add-food toolbar are one card', persona: 'meal-planner', brief: 'week-day-joined-tabs',
  steps: [
    'Make the window 1920 px wide and open Nutrition. Read the top of the page, then press Add food and close the sheet.',
    'Make the window 1000 px wide, then 700 px, and read the card again.',
    'Make the window 375 px wide.',
  ],
  expected: [
    'At 1920 px one bordered card holds the week arrows, This week and its dates at the left, Manage at the right end, and under a hairline "Adding to ..." at the left with Add missing to Shopping, Scan and log, Quick add, One-off food and Add food (last, highlighted) at the right end. The seven day columns start below the card. The buttons open what they opened before.',
    'At 1000 px and 700 px the seven day tabs sit between the week row and the toolbar, inside the same card; at 700 px the buttons wrap onto a second line inside the card and nothing runs past its border.',
    'At 375 px the layout is the phone one: the card has the week and the day tabs only, and the add buttons are in their own row below it.',
  ],
};

export default scenario;
