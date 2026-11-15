import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-301', feature: 'Erased account', title: 'A second device that still holds an erased account\'s old data resets instead of uploading it', persona: 'erased-account', brief: 'feature-map', device: true, edge: true,
  steps: [
    'Needs a second device, in practice your real phone, that still holds this account\'s old data because it was signed in before the account was erased (S-271 walks the same account on one device; an emulated view cannot hold that old data). On that phone, open the app and wait for it to sync.',
    'Read what the Board, Progress and Groceries show on that device.',
  ],
  expected: [
    'The device resets to empty rather than uploading its old data, because the account is on a later data epoch.',
    'The Board, Progress and Groceries show their empty or first-run states, with no program, log or groceries from before the erase.',
  ],
};

export default scenario;
