import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-157', feature: 'Meals from foods', title: 'Build a cereal bowl from two foods and see its numbers add up', persona: 'recipe-collector', brief: 'meals-from-foods',
  steps: [
    'In Recipes press + New, add a food by hand called Oat cereal (150 kcal, 5 g protein) and another called Whole milk (150 kcal, 8 g protein). Then press + New, Recipe or meal, name it Cereal bowl, press + Food or meal, pick Oat cereal, press More once, press + Food or meal again and pick Whole milk. Press Save recipe.',
  ],
  expected: [
    'While you build it the form says Per serving, from the parts: 375 kcal and 15.5 g protein, with 2 of 2 ingredients counted. After Save the recipe\'s page says the same, lists 1.5 portions Oat cereal and 1 portion Whole milk, and Log offers those numbers.',
  ],
};

export default scenario;
