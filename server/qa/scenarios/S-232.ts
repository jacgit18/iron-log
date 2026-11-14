import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-232', feature: 'Typed amounts', title: 'Typed rows survive a calorie change, filled rows do not, and a silly amount is refused in words', persona: 'diet-fresh', brief: 'type-food-amounts', edge: true,
  steps: [
    'Press Add food, Find food, pick a food from the results and press Use. Press "+ Add a nutrient", choose a nutrient the food does not list in the new row (Iodine; a food from the database already lists zinc and copper) and type 1.5. Then change the calories.',
    'On a fresh One-off form open the section, add Vitamin B12 with 1 and unit mg, then add Zinc twice (5 mg, then 2000 mcg). Read the lines under the rows.',
    'Press Add, then Edit the food in Eaten and change only its name.',
  ],
  expected: [
    'After the calorie change the filled rows go and the line says "Calories changed: amounts you did not retype were cleared."; the Zinc row you typed stays. While rows are showing, the "Vitamins and minerals" heading cannot be folded.',
    'The lines read "Vitamin B12 1 mg is far above any food; left out." and "Zinc is listed twice; only the first is kept." The saved food has only Zinc 5 mg.',
    'Changing only the name keeps the amounts; changing the calories on edit drops the ones you did not retype.',
  ],
};

export default scenario;
