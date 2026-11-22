import type { Scenario } from '../scenarios.ts';

// ---- Suggest and copy ----
const scenario: Scenario = {
  id: 'S-10', feature: 'Suggest and copy', title: 'Quick add suggests by the hour', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
  steps: [
    'Open Daily, Nutrition and press Add food, then Quick add.',
    'Read Suggested now (the seed logged Oatmeal with berries near 8, Greek yogurt 10, Chicken and rice bowl 13, Almonds and fruit 16, Salmon with potatoes 19).',
    'Tap the first suggestion.',
  ],
  expected: [
    'The food eaten nearest to the current hour comes first; foods never eaten near this hour still appear after the ranked ones.',
    'Tapping adds one portion with the latest numbers of that food and the totals move and the notice reads "Added <food>." (there is no Undo here; delete the entry by hand to put the day back).',
  ],
};

export default scenario;
