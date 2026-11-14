import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-98', feature: 'Security headers', title: 'Every tab and the plain pages render styled with no security errors in the console', persona: 'diet-fresh', brief: 'camera-and-headers', edge: true,
  steps: [
    'On a computer, open the QA site in Chrome with developer tools open on the Console tab, and sign in.',
    'Open each tab in turn (Daily, Progress, Program, Settings) and open one sheet on each.',
    'Open /privacy, /terms and an address that does not exist, such as /nothing-here, one after another.',
  ],
  expected: [
    'Every screen is styled as normal (colours, fonts and layout, not bare text).',
    'The Console shows no red errors that mention Content Security Policy, Permissions Policy or "Refused to".',
    'The privacy and terms pages and the "Page not found" page are styled the same way and show no such errors.',
  ],
};

export default scenario;
