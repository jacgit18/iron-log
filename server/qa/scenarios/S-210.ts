import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-210', feature: 'Nutrition board', title: 'Supplements tick on any day, each with its own count', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'Press Manage, then Supplements and library. Under Morning type "Creatine" with dose "5 g" and press Add; under Night add "Magnesium" with "400 mg". Press Done.',
    'On today\'s column read Supplements, then tick Creatine.',
    'Tick Magnesium on a day after today, then press Last week and tick both on one day. Press This week.',
  ],
  expected: [
    'Each day lists Morning: Creatine 5 g and Night: Magnesium 400 mg with a tick each and "0 of 2 taken" (a day with none scheduled says "Nothing scheduled").',
    'Today reads "1 of 2 taken". The day ahead reads "1 of 2 taken" and last week\'s day "2 of 2 taken"; each day keeps its own ticks after you switch weeks and come back.',
  ],
};

export default scenario;
