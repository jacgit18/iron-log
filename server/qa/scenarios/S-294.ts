import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-294', feature: 'Joined week and day tabs', title: 'Nutrition on a tablet or small desktop: the card with the days on screen shaded, no day dropdown', persona: 'meal-planner', brief: 'week-day-joined-tabs',
  steps: [
    'Make the window 1024 px wide and open Nutrition. Read the top, then tap the first day tab that is not shaded.',
    'Tap a shaded day tab, then press Next week and tap a day.',
    'Make the window 768 px wide, then 1280 px, then 1440 px.',
  ],
  expected: [
    'One card holds the week arrows, This week or its dates, Manage at the right end, Sun to Sat under them, and the add-food toolbar under a hairline; there is no day dropdown and no Previous day or Next day buttons. Three day tabs are lightly shaded, with a bar on their top edge, and match the three columns shown (a screen reader says "shown below").',
    'A tab outside the shade moves the columns to start at it (held inside the week) and the shade follows; a shaded tab keeps the columns where they are and moves the underline. The toolbar says "Adding to" the underlined day.',
    'At 768 px two tabs are shaded, at 1280 px three. At 1440 px the card stays but has no day tabs: the week switcher, dates, Manage and the add-food toolbar are in it above seven columns.',
  ],
};

export default scenario;
