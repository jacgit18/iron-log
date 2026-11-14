import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-160', feature: 'Meals from foods', title: 'Use my own numbers keeps typed numbers; turning it off adopts the roll-up', persona: 'recipe-collector', brief: 'meals-from-foods', edge: true,
  steps: [
    'Edit Cereal bowl, tick Use my own numbers, press Edit under Nutrition per serving, type 700 calories and Save. Open the page, then edit again and untick Use my own numbers and Save.',
  ],
  expected: [
    'With the switch on the page says Your own numbers are used and shows what the parts add up to as a hint; 700 stays. With it off the page says Per serving, from the parts and the numbers come from the foods again.',
  ],
};

export default scenario;
