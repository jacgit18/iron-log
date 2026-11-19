import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-295', feature: 'Desktop week card', title: 'Board on a desktop: one card with the week, mode, body weight and filters, notices under it', persona: 'heavy-logger', brief: 'feature-map',
  steps: [
    'On a desktop (1280 px wide) open Board. Read the top from the Workout and Stretches buttons down.',
    'In the card, change the week with the arrows, pick Mode 2 and flip A and B, type a body weight and press Save, pick a muscle in Sort by muscle, pick an equipment, press Clear, and flip Injury prevention.',
    'Narrow the window to 768 px, then 701 px, then widen to 1920 px.',
  ],
  expected: [
    'Under Workout and Stretches there is one bordered card. Its first row has the week arrows, date range and This week at the left and the program switch, the mode menu and Body weight with Save at the right. Under a hairline, its second row has Sort by muscle, Equipment (and Clear once one is set) at the left and Injury prevention at the right.',
    'Every control does what it did before. The notices (the local-save tip, the unchecked-exercises notice) sit under the card, above the seven day columns, which are unchanged.',
    'At the narrower widths the rows wrap onto more lines inside the card; nothing runs past the card or scrolls sideways. On a phone the card does not exist: Board keeps the joined week and day card, which holds the Sort and Injury row and Body weight; the notices sit under it.',
  ],
};

export default scenario;
