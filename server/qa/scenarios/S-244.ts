import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-244', feature: 'Active ingredients', title: 'Totals shows an Active ingredients section with your own cap and target', persona: 'supplement-stack', brief: 'supplement-active-ingredients',
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'Open Daily, Nutrition, find today, and open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
    'Find the Active ingredients section. Read the Omega-3 and EPA rows. Press "Everything scheduled" and read the Creatine row.',
    'Press the limit button on Creatine, set a target of 5 g and save, then reopen the row and remove the limit.',
  ],
  expected: [
    'Omega-3 reads 2,000 mg against its 1,500 mg cap with words and a rust bar (over the cap, never colour alone); EPA 600 mg against a 500 mg target reads Met. Creatine, scheduled but unticked, shows its figure with "Set your limit".',
    'The limit sheet and the Totals sheet carry the not-medical-advice note and suggest no dose. A zero, negative or oversized amount is refused. Back closes the limit sheet.',
  ],
};

export default scenario;
