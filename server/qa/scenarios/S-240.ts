import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-240', feature: 'Supplement times', title: 'Turning off the last chip returns the supplement to Library only', persona: 'supplement-stack', brief: 'supplement-merged-list', edge: true,
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'In Manage, Supplements and library, find Creatine monohydrate (lit at Noon only) and press its Noon chip.',
    'Read the filter counts (All, Scheduled, Library only), then press Library only.',
  ],
  expected: [
    'Creatine has no chip lit and appears under Library only; the counts add up (Scheduled lost one, Library only gained one).',
    'Search and the Source filter narrow the list, and an empty result says so.',
  ],
};

export default scenario;
