import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-39', feature: 'Wide layouts', title: 'Exercise library in two columns', persona: 'superset-builder', brief: 'library-two-columns',
  steps: [
    'Open Program, then Exercises (`#/program/exercises`), at 1920 px and at 1024 px. The heading reads "Exercises" and the search box "Search 46 exercises" (the account\'s two programs use 46; if it says 0, press Reset on the account).',
    'Use Search and an Equipment chip at 1920 px.',
  ],
  expected: [
    'From 1280 px the exercise rows sit in two columns and the filters share one full-width row.',
    'At 1024 px it is one column, at most 760 px wide.',
  ],
};

export default scenario;
