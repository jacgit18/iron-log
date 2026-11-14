import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-255', feature: 'Ideas filters', title: 'The idea card and its Add sheet', persona: 'superset-builder', brief: 'ideas-card-filters-watch',
  steps: [
    'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
    'On an idea card read status, name, muscle chips, note and Add. Press Add and choose This week only plus a day, then Undo.',
  ],
  expected: [
    'The card shows status, name (opens Edit), up to two muscle chips, a short note, a large Watch tile only when there is a link, Add and a menu. Add opens "Add <name>" with day buttons in the Board\'s order; This week only shows "Added to Day N this week" with an Undo that removes it.',
  ],
};

export default scenario;
