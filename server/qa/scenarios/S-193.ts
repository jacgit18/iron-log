import type { Scenario } from '../scenarios.ts';

// ---- Nutrition board (PRs 815 and 816, brief nutrition-board; ADR 105). Written after the build from the code's own labels; nothing here has been run by the owner. ----
// The board's day names read like "Thu 24 · today"; examples below use a made-up date, so read it against your own calendar. Seed facts: the Diet accounts hold targets of 2,400 kcal, 160 g protein and 70 g fat.
const scenario: Scenario = {
  id: 'S-193', feature: 'Nutrition board', title: 'Nutrition is one board with a week switcher', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'Open Daily, Nutrition at 1920 px wide.',
    'Read the top of the page: the week arrows with This week, the line under them, and the two buttons at the right (there is no "Nutrition" heading).',
    'Look down the page for panels named Diet, Supplements, Water, Food eaten and Last 7 days.',
  ],
  expected: [
    'The week switcher is a pair of arrows with a This week button; a line under them names the week (for example "This week · Sep 24 to 30"); the button at the right reads Manage.',
    'Seven day columns sit side by side; today\'s is named with "· today". Each holds five meters (Calories, Protein, Fat, Supplements, Water), its meals (food nobody planned sits in the meal for the hour it was logged), Supplements and Hydration.',
    'None of the old panels is there; food, supplements, water and targets are all reachable from the board (S-199 to S-218).',
  ],
};

export default scenario;
