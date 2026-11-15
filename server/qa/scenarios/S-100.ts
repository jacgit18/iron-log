import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-100', feature: 'Link previews', title: 'The sitemap and icon files load, and the plain pages have their own titles', persona: 'new-user', brief: 'share-preview-sitemap',
  steps: [
    'In a browser, open /sitemap.xml and /favicon.ico on the QA address.',
    'Open /privacy.html, /terms.html and /delete-account and read each browser tab\'s title.',
    'Open the app itself and read its tab title and icon.',
  ],
  expected: [
    '/sitemap.xml shows an XML list of five addresses (the home page, /plans, /privacy.html, /terms.html and /delete-account), all naming loadbearer.app, the production host; /favicon.ico loads a small picture, not a "not found" page.',
    'The tabs are titled "Privacy Policy · Loadbearer", "Terms of Use · Loadbearer" and "Delete your account · Loadbearer".',
    'The app tab is titled "Loadbearer QA" on QA (plain "Loadbearer" on production) with the logo as its icon (the QA logo on QA).',
  ],
};

export default scenario;
