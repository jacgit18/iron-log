import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-242', feature: 'Supplement times', title: 'The Add sheet picks several times, and Library only stands alone', persona: 'supplement-stack', brief: 'supplement-split-times',
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'In Manage press + Add. Search "Magnesium" and pick a result (or type a name if the catalog has none).',
    'Press Morning and Night, then press Library only, then Morning again.',
    'Press Add.',
  ],
  expected: [
    'Morning and Night both light; pressing Library only clears them; pressing Morning clears Library only.',
    'The supplement is added at Morning at one serving. With Morning and Night both lit it is added to both.',
  ],
};

export default scenario;
