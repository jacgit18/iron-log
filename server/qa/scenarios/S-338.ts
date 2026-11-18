import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-338', feature: 'Receipt tax adds up', title: 'Two devices each apply a different receipt and both receipts survive the sync', persona: 'grocery-shopper', brief: 'receipt-tax-adds-up', edge: true,
  steps: [
    'Sign in as Grocery shopper in two browsers (or a browser and a phone) and open Groceries on the same month on both. Note the store\'s Tax box on Bought; both should show the same amount.',
    'Put both devices offline (airplane mode, or the browser\'s offline setting).',
    'On device one, scan and Apply receipt A from one store (Scan receipt, Photos, wait for the sheet titled Receipt, Apply). On device two, scan and Apply a different receipt B from the same store, in the same month, with a different tax.',
    'Put both devices back online and wait for them to sync (reload each once if nothing changes).',
    'On both devices, open Bought and read that store\'s Tax box and the note beside it.',
  ],
  expected: [
    'Both devices show the same Tax: the starting amount plus receipt A\'s tax plus receipt B\'s tax (neither receipt replaced the other).',
    'The note beside the Tax box reads "From 2 receipts" on both devices more than the starting count (for a start with none, "From 2 receipts").',
    'Scanning receipt A again on either device now shows the notice "Already applied to <month>: <store>, <receipt date>. Tax and rewards are not added again."',
  ],
};

export default scenario;
