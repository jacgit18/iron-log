import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-02', feature: 'Diet targets and log', title: 'Over target, and the 20 entries a day limit', persona: 'diet-over-target', brief: 'diet-targets-and-log', edge: true,
  steps: [
    'Open Daily, Nutrition and read today\'s Calories and Protein meters.',
    'Press Add food, One-off food, and add small foods (for example "Tea", 5 kcal, 0 g) until the day holds 20 entries.',
    'Try to add a 21st from One-off food, then open Quick add from the sheet\'s list of ways.',
  ],
  expected: [
    'Today is about 120% of the calories (about "2,880 / 2,400 kcal"); the bar stays full and turns red, and protein reads short (about "106 / 160 g").',
    'A 21st one-off food is refused with "You can log 20 things a day."; Quick add shows "That’s 20 things for the day. Delete one to add another." instead of its choices. Deleting one entry from the eaten rows brings both back.',
  ],
};

export default scenario;
