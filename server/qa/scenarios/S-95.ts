import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-95', feature: 'Sharing done', title: 'Done closes the Sharing panel and adds what you typed', persona: 'grocery-shopper', brief: 'sharing-done-button',
  steps: [
    'Open Daily, Groceries, Inventory, press Sharing groups and look at the bottom of the panel.',
    'In the Home group type Jo in Add a person without pressing Add person, then press Done.',
    'Press Sharing again and look at the Home group.',
  ],
  expected: [
    'A Done button sits at the bottom of the panel. Pressing it closes the panel, a note says "Sharing saved." under the buttons, and focus is back on the Sharing button.',
    'Jo is in the Home group, added by Done; the note is gone while the panel is open again.',
  ],
};

export default scenario;
