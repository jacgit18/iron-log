import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-238', feature: 'Food vitamins and minerals', title: 'A recipe built from a food adds up its vitamins and minerals, logged or planned', persona: 'vitamin-tracker', brief: 'recipes-vitamins-minerals',
  steps: [
    'Press Reset on the Vitamin tracker first, so today is the seeded day. In Recipes press + New, Recipe or meal, and name it "Cereal duo". Press + Food or meal, pick "Fortified cereal", then press the + beside "1 portion" once so it reads "1.5 portions". Press Save recipe.',
    'On the recipe\'s page press Ate this, then open Nutrition and open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
    'Close Totals. Tap tomorrow, press Add food, Recipes, choose Dinner under "Which meal?", press Plan beside "Cereal duo" and press Done. Open the planned card, press "Move to…" and choose today under Day (the card stays under Dinner: the Day buttons keep the meal, the Meal buttons stay on the same day). On today tick "Check Cereal duo as eaten", then press Totals again.',
  ],
  expected: [
    'The form and the saved page say "Per serving, from the parts: 180 kcal · 4.5 g protein · 39 g carbs · 1.5 g fat. 1 of 1 ingredient counted." and list "1.5 portions Fortified cereal".',
    'After the first log (1.5 portions of the cereal on top of the seeded day): Calcium 1,015 mg, Iron 9.25 mg, Vitamin D 128 mcg "Over the limit by 28 mcg", Zinc 37.8 mg "Close to the limit (95%)". The line reads "Food: 3 of 4 eaten foods had vitamin or mineral data."',
    'After the planned one is logged from the board: Calcium 1,210 mg, Iron 16 mg, Vitamin D 131 mcg, Zinc 39.6 mg "Close to the limit (99%)", and "Food: 4 of 5 eaten foods had vitamin or mineral data." Each log adds the same 195 mg of calcium, 6.75 mg of iron, 3 mcg of vitamin D and 1.8 mg of zinc.',
  ],
};

export default scenario;
