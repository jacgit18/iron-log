import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-96', feature: 'Sharing done', title: 'Text that cannot be added keeps the panel open', persona: 'grocery-shopper', brief: 'sharing-done-button', edge: true,
  steps: [
    'Open the Sharing panel, type Sam in Add a person in the Home group (Sam is already there) and press Done.',
    'Clear the box and press Done.',
  ],
  expected: [
    'The panel stays open and the Home group says "That person is already in this group."; no "Sharing saved." note appears.',
    'With the box empty, Done closes the panel and says "Sharing saved.".',
  ],
};

export default scenario;
