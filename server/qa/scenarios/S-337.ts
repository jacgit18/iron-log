import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-337', feature: 'Receipt tax adds up', title: 'The Tax box still sets the store\'s total by hand', persona: 'grocery-shopper', brief: 'receipt-tax-adds-up', edge: true,
  steps: [
    'Apply a receipt from one store with sales tax printed on it (Scan receipt, Photos, wait for the sheet titled Receipt, Apply). Open Bought and find that store\'s Tax box.',
    'Type 4.00 in the Tax box and press Enter.',
    'Reload the page and open Bought again.',
  ],
  expected: [
    'The Tax box shows 4.00 (the typed amount replaces the total; it is not added to the receipt\'s tax).',
    'The note beside it still reads "From 1 receipt".',
    'After the reload the Tax box still shows 4.00, and the totals for that store use it.',
  ],
};

export default scenario;
