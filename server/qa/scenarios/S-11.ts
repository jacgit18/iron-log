import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-11', feature: 'Suggest and copy', title: 'Copy yesterday with one food unticked', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
  steps: [
    'On Nutrition press Add food, then Copy yesterday, then Copy yesterday again: yesterday\'s foods are all ticked.',
    'Untick one and press Add selected.',
  ],
  expected: [
    'Only the ticked foods are added to today, with their numbers unchanged, and they show in the eaten rows.',
    'If the day would pass 20 entries it adds what fits and says how many were left out.',
  ],
};

export default scenario;
