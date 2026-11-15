import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-227', feature: 'Vitamin and mineral day line', title: 'An earlier day with no ticks still shows what the foods carried', persona: 'vitamin-tracker', brief: 'vitamin-mineral-day-meter', edge: true,
  steps: [
    'Open the day four days ago (use the day picker; it can be in last week) and read the line under Supplements.',
    'Open the day five days ago and read its line.',
  ],
  expected: [
    'Four days ago nothing was ticked, but the foods listed amounts: "Vitamins and minerals: Calcium 16% · Zinc 15%", no Vitamin D over.',
    'Five days ago Magnesium and the B12 and fiber capsule were ticked: "Vitamins and minerals: Magnesium 57% · Calcium 16%".',
  ],
};

export default scenario;
