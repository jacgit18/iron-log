import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-340', feature: 'Group share across stores', title: 'Changing who paid moves Paid, and Mark paid changes nothing in the table', persona: 'grocery-shopper', brief: 'group-share-across-stores', edge: true,
  steps: [
    'Follow S-339 so the "Everyone across all stores" table shows, and note every Paid and Share cell and the All row.',
    'On the Costco card press Mark paid on one row, then press Undo (or Not paid) on it.',
    'On the Costco card change "Paid by" to Sam.',
  ],
  expected: [
    'Mark paid and Undo do not change any cell of the table, nor the note under it.',
    'With Sam as payer at Costco, the Paid column moves: Sam\'s Paid is now the Costco bill and yours drops by it. Every Share cell and the All row\'s Paid and Share stay as they were.',
  ],
};

export default scenario;
