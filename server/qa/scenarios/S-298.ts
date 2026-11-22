import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-298', feature: 'Meal vitamin bars', title: 'Build a meal from two foods and check its calcium adds up', persona: 'meal-planner', brief: 'meal-micro-breakdown',
  steps: [
    'Open Recipes, New, Add a food. Name it Oat cereal, set 150 calories and 5 g protein, and add calcium 100 mg and vitamin D 1 mcg in the vitamins and minerals rows. Save it. Do the same for Whole milk: 150 calories, 8 g protein, calcium 300 mg, vitamin D 2.9 mcg.',
    'Open Recipes, New, Recipe or meal. Name it Cereal bowl. Press + Food or meal and pick Oat cereal, then + Food or meal again and pick Whole milk.',
    'Under "Per serving, from the parts", read the button, press it, and read the Calcium and Vitamin D rows. Then press More next to Whole milk.',
  ],
  expected: [
    'A button reads "Vitamins and minerals: 2 listed", closed.',
    'Pressed, it opens a legend with Oat cereal and Whole milk, and a Calcium bar with 100 on a gold segment and 300 on a blue one, 400 mg on the right. Vitamin D shows 1 and 2.9, 3.9 mcg on the right. Neither row has an "at least" tag.',
    'After More, milk is 1.5 portions and Calcium reads 100 and 450, 550 mg; the segments and the total change together.',
  ],
};

export default scenario;
