import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-212', feature: 'Nutrition board', title: 'Hot day and training minutes change the goal line by line', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'Open the drink sheet on today. Tick Hot day (+16 oz).',
    'Type 60 in Training (minutes) and tab out of the field. Read the Goal lines.',
    'Type 700 in Training (minutes) and tab out.',
    'Press Done and read the tags under Hydration.',
  ],
  expected: [
    'The goal rises by 16 oz and the Goal breakdown gains a "Hot day" line; training adds 12 oz per 30 minutes, so 60 minutes adds a "Training 60 min" line of 24 oz; the Goal line is the sum.',
    '700 is refused with "Enter training minutes, up to 600" and the field returns to 60.',
    'Hydration shows tags "Hot day +16" and "Training 60 min +24" and the Water meter uses the new goal. The link “Change base goal in Manage” opens Manage (S-216).',
  ],
};

export default scenario;
