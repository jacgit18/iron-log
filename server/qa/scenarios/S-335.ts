import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-335', feature: 'Receipt tax adds up', title: 'The same receipt again is noticed and its tax is added only with the tick', persona: 'grocery-shopper', brief: 'receipt-tax-adds-up', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, pick a photo of a receipt with sales tax printed on it, wait for the sheet titled Receipt, and press Apply. Note the store\'s Tax box on Bought.',
    'Go back to Shopping and scan the same receipt photo again. Wait for the sheet titled Receipt.',
    'Read the notice above the numbers line, then press Apply without ticking anything. Look at the Tax box on Bought.',
    'Scan the same receipt a third time. This time tick "Add tax and rewards again anyway", then press Apply. Look at the Tax box on Bought.',
  ],
  expected: [
    'The second sheet shows a notice "Already applied to <month>: <store>, <receipt date>. Tax and rewards are not added again." with an unticked box "Add tax and rewards again anyway".',
    'Applying without the tick leaves the Tax box (and the Rewards box, if used) at the amount from the first Apply, and the "From 1 receipt" note is unchanged.',
    'The third sheet shows the same notice; with the box ticked, Apply adds that receipt\'s tax once more, so the Tax box doubles and the note reads "From 2 receipts".',
  ],
};

export default scenario;
