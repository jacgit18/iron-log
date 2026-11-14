import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-50', feature: 'Label scan', title: 'A blurry photo or a label with per 100 g only', persona: 'diet-fresh', brief: 'label-photo-scan', edge: true, device: true,
  steps: [
    'On a phone, press Scan label and photograph something that is not a label (a table), then a label that only shows a per 100 g column if you have one.',
    'Check that every account (not only an admin) sees Scan label and Choose photo on the New food form.',
  ],
  expected: [
    'The form stays empty and says "Could not read the numbers. Try a closer, flatter photo or type them in." (or "That label only shows numbers per 100 g, so nothing was filled in. Type the numbers for one serving."); you can still type the numbers and save.',
    'Every account sees Scan label and Choose photo.',
  ],
};

export default scenario;
