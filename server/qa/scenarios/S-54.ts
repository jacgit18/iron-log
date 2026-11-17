import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-54', feature: 'Receipt scan', title: 'A bad photo or a total that does not add up', persona: 'grocery-shopper', brief: 'receipt-scan', edge: true, device: true,
  steps: [
    'On a phone, press Scan receipt, then Camera, and photograph something that is not a receipt, or half of one.',
    'Scan a real receipt again with the bottom cut off, so a line is missing, and look at the Total check.',
  ],
  expected: [
    'A photo that is not a receipt says it could not read it and changes nothing on the list.',
    'A cut-off receipt shows the missing amount in the Total check but still lets you Apply.',
  ],
};

export default scenario;
