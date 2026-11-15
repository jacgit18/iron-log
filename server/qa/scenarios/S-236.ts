import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-236', feature: 'Supplement portions', title: 'The seeded Night capsule is at half a serving', persona: 'vitamin-tracker', brief: 'supplement-portions',
  steps: [
    'Read the Night supplement on today, then press Manage, Supplements and library, find the one Magnesium glycinate row (Morning and Night both lit) and press Edit.',
  ],
  expected: [
    'The day shows "1 capsule" beside Night\'s Magnesium glycinate and nothing beside Morning\'s. In "When you take it" the total reads "3 capsules a day" with "Morning 2 · Night 1", and there is one set of nutrient rows (200 mg magnesium per serving of 2 capsules).',
  ],
};

export default scenario;
