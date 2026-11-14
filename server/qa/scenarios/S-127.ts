import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-127', feature: 'Receipt scan', title: 'A receipt that does not add up needs a second tap to apply', persona: 'grocery-shopper', brief: 'receipt-apply-footer', edge: true, device: true,
  steps: [
    'On a phone, scan a receipt with the bottom cut off so a line is missing and the Total check says the lines differ.',
    'Press Apply anyway once, then tap somewhere else on the sheet. Press Apply anyway, then Tap again to apply anyway.',
  ],
  expected: [
    'The summary line says the lines and tax do not match the receipt total, and the button reads "Apply anyway".',
    'The first tap only changes the button to "Tap again to apply anyway" and applies nothing; tapping elsewhere puts it back; the second tap applies and Undo is offered.',
  ],
};

export default scenario;
