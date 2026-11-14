import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-245', feature: 'Active ingredients', title: 'What I took versus what is scheduled, and units', persona: 'supplement-stack', brief: 'supplement-active-ingredients', edge: true,
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'Close Totals and untick the Night Fish oil on the day\'s Supplements, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) and read the Omega-3 row on What I took and on Everything scheduled.',
    'Add a typed ingredient "Vitamin A" in IU to Multivitamin and read its row.',
  ],
  expected: [
    'Omega-3 on What I took falls to 1,000 mg (under the cap) while Everything scheduled stays 2,000 mg; g, mg and mcg convert between rows.',
    'An IU row matches only an IU limit and is never converted to mg.',
  ],
};

export default scenario;
