import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-113', feature: 'Price history', title: 'Packs at two prices, a purchase with no price, and an item never bought', persona: 'grocery-shopper', brief: 'grocery-price-history', edge: true,
  steps: [
    'On Shopping, tick an item bought and give it two pack prices (Add price twice, for example $2.50 and $3.00). Tick another item bought and leave its price empty.',
    'On Inventory tap the Last: line of the pack item, then of the item with no price.',
    'Find an item you have never ticked bought and look under its name.',
  ],
  expected: [
    'The pack item reads "Last: $2.75 at ..." and its sheet row says "$2.50 + $3.00 (2 packs)".',
    'The item with no price reads "Last: no price at ..." and its sheet row says "No price saved" and is left out of Cheapest and the average.',
    'The item never bought has no line under it.',
  ],
};

export default scenario;
