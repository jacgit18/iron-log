import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-102', feature: 'Search hiding', title: 'Production\'s robots.txt still allows search, once production has the new build', persona: 'new-user', brief: 'qa-noindex-robots', edge: true,
  steps: [
    'In a terminal, run curl https://loadbearer.app/robots.txt (or open that address in a browser) and read the answer.',
  ],
  expected: [
    'Production answers "User-agent: *", "Allow: /" and a "Sitemap: https://loadbearer.app/sitemap.xml" line. It never answers Disallow: /.',
    'Until production is deployed with PR 740, it may still answer the older file (no Sitemap line); that is expected, not a fail. A "Disallow: /" on production is a fail.',
  ],
};

export default scenario;
