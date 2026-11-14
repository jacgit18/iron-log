import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-215', feature: 'Nutrition board', title: 'Back closes a sheet and the page keeps its address', persona: 'diet-on-target', brief: 'nutrition-board',
  steps: [
    'Open Nutrition and note the address (it ends "daily/nutrition").',
    'Open Add food and press the browser\'s Back (on a phone the back-swipe). Do the same for + Drink and Manage.',
    'Open Manage, Supplements and library, then press Back.',
  ],
  expected: [
    'Each sheet closes on one Back step and you stay on Nutrition; the address never gains a day or a sheet name. (Expected from the code and the e2e spec; not yet walked by hand.)',
    'Back from a sheet does not leave the Nutrition tab, and a reload reopens Nutrition.',
  ],
};

export default scenario;
