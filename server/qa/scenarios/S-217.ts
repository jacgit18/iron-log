import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-217', feature: 'Nutrition board', title: 'Manage refuses a bad water goal, and Use my weight puts the base goal back', persona: 'diet-on-target', brief: 'targets-into-manage', edge: true,
  steps: [
    'In Manage press Change base goal, type 5 and press Use this amount.',
    'Type 80, press Use this amount, press Change base goal and Use my weight.',
  ],
  expected: [
    'The message reads "Enter a daily goal between 8 and 500 oz"; nothing is saved by a refused entry.',
    'Use my weight puts the base goal back to half the body weight.',
  ],
};

export default scenario;
