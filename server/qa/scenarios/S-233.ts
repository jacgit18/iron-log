import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-233', feature: 'Label scan', title: 'A label photo fills the vitamin and mineral rows, to check against the label', persona: 'diet-fresh', brief: 'food-vitamins-minerals', device: true,
  steps: [
    'On a phone, press Add food, Find food, then the label photo option after a miss (or scan from the New food form), and photograph the Nutrition Facts of a fortified cereal or a packaged food that lists sodium and fiber.',
    'Compare every vitamin and mineral row with the label, remove one row (press Remove, then Tap again to remove), then change the calories.',
  ],
  expected: [
    'The form shows each vitamin and mineral the label lists as its own row (including Sodium and Fiber when listed) so each can be checked against the label.',
    'Removing a row removes only that amount. Changing the calories clears the rows the photo filled and says so. Record any amount that does not match the label: that is the accuracy check for the label scan.',
  ],
};

export default scenario;
