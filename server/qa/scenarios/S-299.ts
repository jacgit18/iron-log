import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-299', feature: 'Meal vitamin bars', title: 'A food that does not list a vitamin shows as not listed, and the total says at least', persona: 'meal-planner', brief: 'meal-micro-breakdown', edge: true,
  steps: [
    'Make Oat cereal with calcium 100 mg and iron 8 mg, and Whole milk with calcium 300 mg and no iron (as in the first scenario). Build Cereal bowl from the two and open Vitamins and minerals.',
    'Read the Iron row and the note under the bars. Save the meal and open it from the Recipes list; open Vitamins and minerals there too.',
  ],
  expected: [
    'The Iron bar is one gold segment reading 8 and a hatched segment reading "not listed"; the total reads "≥ 8 mg" with an "at least" tag. A note says the real total could be higher.',
    'The meal page shows the same button, closed, and the same rows when opened. Calcium still reads 400 mg with no tag.',
  ],
};

export default scenario;
