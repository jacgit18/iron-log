import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-115', feature: 'Program tab clarity', title: 'Rows say what they hold; a superset sits in one box; Day at a glance and its breakdown', persona: 'superset-builder', brief: 'program-tab-clarity',
  steps: [
    'On a computer open Program, Day 1.',
    'Look at a Main lift row, a superset and an either/or row, and the section labels.',
    'Look at Day at a glance, then press See the full breakdown (on a screen 1280 px or wider it starts open, so the press folds it).',
  ],
  expected: [
    'Each row shows the name, a pill (Main lift, Accessory or Optional), sets and weight and a coloured phase pill; a superset card shows a line per exercise; consecutive superset cards share one box labelled Superset. Optional, Regular and Supersets explain themselves; a section you named yourself shows as you typed it.',
    'Day at a glance shows the exercise and set counts and one sentence; the phase, muscles and equipment breakdown starts open, and See the full breakdown toggles it. The panel is only drawn from 1280 px, so a narrower screen shows no Day at a glance. Edit and the more-actions button still open their sheets.',
  ],
};

export default scenario;
