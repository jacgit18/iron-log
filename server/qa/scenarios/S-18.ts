import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-18', feature: 'Food lookup', title: 'Food search offline', persona: 'diet-on-target', brief: 'diet-food-lookup', edge: true,
  steps: [
    'Turn the browser offline (DevTools Network, Offline).',
    'Press Add food, then Find food. In the "Search your past meals and recipes" box type "banana", then type the numbers by hand and press Add.',
  ],
  expected: [
    'The search says "You are offline. You can still type the numbers." ("Food search is not available right now." is the message when the service is down, not when you are offline) and the rest of the form keeps working; Add still logs the entry.',
  ],
};

export default scenario;
