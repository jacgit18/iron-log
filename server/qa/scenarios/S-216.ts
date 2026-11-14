import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-216', feature: 'Nutrition board', title: 'Manage: daily targets with the read-only goal, and the base water goal in one sheet', persona: 'diet-fresh', brief: 'targets-into-manage',
  steps: [
    'Press Manage and read the headings: Daily targets, Water, Library. There is no Weight and goal heading.',
    'Read the goal line under Daily targets. Press Edit in Progress, then come back to Nutrition and press Manage again.',
    'Type 2,000 into Calories under Daily targets. Then press Change base goal, type 80 and press Use this amount.',
    'Press Done and read the board\'s Calories and Water meters.',
  ],
  expected: [
    'The sheet holds three sections; the goal line under the daily targets reads "Goal: N lb by date" (or "No goal set") and has no input; there is no current-weight line. There is no Targets and goal button on the board and no colour legend.',
    'Edit in Progress closes the sheet and opens Progress scrolled to the Body weight chart, where the goal is edited; weight is typed on the board\'s weigh-in row. With a goal, the recommended targets and pace appear (Slow, Steady, Fast, S-03); the typed calories replace only calories. The base goal shows "Base goal 80 oz fixed" with a "Use my weight (0.5 oz per lb)" button.',
    'The board shows Calories against 2,000 and Water against 80 oz plus any hot day or training; a day with a hot day shows 96.',
  ],
};

export default scenario;
