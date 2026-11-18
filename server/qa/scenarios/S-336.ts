import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-336', feature: 'Receipt tax adds up', title: 'Undo of the second receipt takes back only its tax, also after the Tax box was typed in between', persona: 'grocery-shopper', brief: 'receipt-tax-adds-up', edge: true,
  steps: [
    'Apply a receipt from one store with sales tax printed on it (Scan receipt, Photos, wait for the sheet titled Receipt, Apply). Note the Tax box for that store on Bought.',
    'Scan and Apply a second receipt from the same store with a different tax. Note the new Tax amount (the two added).',
    'Without waiting long, press Undo in the notice that appears under Scan receipt. Look at the Tax box on Bought (it should be the first receipt\'s tax) and the note beside it.',
    'Scan the second receipt again, wait for the sheet titled Receipt, and check it shows no "Already applied" notice. Press Apply.',
    'Now type a new amount in that store\'s Tax box on Bought (add 1.00 to what it shows) and press Enter. Go back to Shopping and press Undo in the notice, if it is still showing.',
    'Look at the Tax box on Bought again.',
  ],
  expected: [
    'After the first Undo the Tax box shows only the first receipt\'s tax and the note reads "From 1 receipt".',
    'The second receipt can be applied again after Undo: its sheet shows no "Already applied" notice, and Apply adds its tax back.',
    'After the hand-typed change and the second Undo, the Tax box is the amount you typed minus the second receipt\'s tax only (your extra 1.00 is kept), and the note reads "From 1 receipt".',
  ],
};

export default scenario;
