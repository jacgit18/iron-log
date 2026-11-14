import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-101', feature: 'Search hiding', title: 'QA asks search engines to stay out', persona: 'new-user', brief: 'qa-noindex-robots',
  steps: [
    'In a terminal, run curl https://qa.loadbearer.app/robots.txt (or open that address in a browser) and read the answer.',
    'Open /sitemap.xml on QA and confirm the app itself still loads normally.',
  ],
  expected: [
    'robots.txt answers exactly two lines, "User-agent: *" and "Disallow: /", with no Sitemap line.',
    'The sitemap and the app still load; only crawlers are asked to stay away. The same holds on the Staging address if it is up.',
  ],
};

export default scenario;
