import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-334', feature: 'Receipt tax adds up', title: 'A second receipt from the same store in a month adds its tax to the first', persona: 'grocery-shopper', brief: 'receipt-tax-adds-up',
  steps: [
    'Open Groceries, then Shopping, press Scan receipt, then Photos, and pick a photo of a receipt from one store with sales tax printed on it. Wait for the sheet titled Receipt.',
    'Note the Tax amount in the numbers line, then press Apply.',
    'Open the Bought view and find that store\'s Tax box. Note its amount and the grey note beside it.',
    'Go back to Shopping, press Scan receipt, Photos, and pick a photo of a different receipt from the same store, in the same month, with a different tax. Wait for the sheet titled Receipt, then press Apply.',
    'Open Bought again and look at that store\'s Tax box and the note beside it.',
  ],
  expected: [
    'After the first Apply the Tax box holds the first receipt\'s tax and the note reads "From 1 receipt".',
    'The second receipt\'s sheet shows no "Already applied" notice.',
    'After the second Apply the Tax box holds the two taxes added together (not only the second one) and the note reads "From 2 receipts".',
    'If either receipt printed a rewards credit, the Rewards box adds up the same way and shows its own "From N receipts" note.',
  ],
};

export default scenario;
