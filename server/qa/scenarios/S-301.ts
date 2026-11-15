import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-301', feature: 'Erased account', title: 'A second device that still holds an erased account\'s old data resets instead of uploading it', persona: 'erased-account', brief: 'feature-map', device: true, edge: true,
  steps: [
    'Needs a second device, in practice your real phone (S-271 walks the same account on one device; an emulated view cannot hold old data from before the erase). On the phone, where it still holds this account\'s old data from before the erase, open the app and wait for it to sync.',
    'Read what the Board, Progress and Groceries show on that device.',
  ],
  expected: [
    'The device resets to empty rather than uploading its old data, because the account is on a later data epoch.',
    'The Board, Progress and Groceries show their empty or first-run states, with no program, log or groceries from before the erase.',
  ],
};

export default scenario;
