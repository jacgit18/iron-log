import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-158', feature: 'Meals from foods', title: 'Build a shake from foods, then change one food and the shake follows', persona: 'recipe-collector', brief: 'meals-from-foods',
  steps: [
    'Make a Kefir drink, a Banana food and a Whey food with their calories and protein, then a recipe Shake that links all three with + Food or meal. Open Whey, press Edit, raise its calories and Save, then open Shake again.',
  ],
  expected: [
    'The shake\'s numbers per serving include the new Whey calories without editing the shake, and Log opens at the new numbers. A day already logged keeps the numbers it had.',
  ],
};

export default scenario;
