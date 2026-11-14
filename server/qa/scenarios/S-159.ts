import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-159', feature: 'Meals from foods', title: 'A meal inside a meal rolls up through both, and a loop is refused', persona: 'recipe-collector', brief: 'meals-from-foods', edge: true,
  steps: [
    'Put the Cereal bowl into a new recipe Lunch box with + Food or meal (it is listed under Meals), and check the numbers. Then edit Cereal bowl, press + Food or meal and pick Lunch box.',
  ],
  expected: [
    'Lunch box shows the bowl\'s numbers through both levels. Picking Lunch box inside Cereal bowl says it already contains this meal, so that would loop, and adds nothing. A chain more than 3 levels deep says meals can hold other meals up to 3 levels deep.',
  ],
};

export default scenario;
