import type { Scenario } from '../scenarios.ts';

// ---- Stale page guard ----
const scenario: Scenario = {
  id: 'S-73', feature: 'Stale page guard', title: 'Erase or delete is refused from a page for another account', persona: 'new-user', brief: 'x-expected-user-409',
  steps: [
    'In one browser tab sign in as New user and open Settings. Leave it open.',
    'In a second tab of the same browser, switch to another test account (the QA picker).',
    'Back in the first tab, open Delete my data and press Erase everything in my account, and confirm.',
    'Repeat steps 1 to 3 from the start, pressing Delete my account instead.',
  ],
  expected: [
    'The request is refused: the Delete my data panel stays with a note that this is not available right now and nothing was erased (a card saying the device holds data from another account may show for a moment first); neither account loses anything. The same happens for Delete my account.',
    'After reloading the first tab it shows the account you are now signed in as, and the other test account\'s data is untouched.',
  ],
};

export default scenario;
