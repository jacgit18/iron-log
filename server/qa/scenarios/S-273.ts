import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-273', feature: 'Issues filter', title: 'The Issues list filters by one Status dropdown', persona: 'new-user', brief: 'feature-map',
  steps: [
    'Sign in as an admin (the owner account). Open Settings, then Issues.',
    'Read the Status control: it is one dropdown, not a row of buttons. Open it and read the options, then pick each status in turn, then clear it with the x or All.',
  ],
  expected: [
    'Status is a single dropdown whose options carry their counts and which starts on Open; the list shows only that status; the x or All shows every issue. An account that is not an admin has no Issues panel.',
  ],
};

export default scenario;
