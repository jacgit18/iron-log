import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-112', feature: 'Price history', title: 'An Inventory item shows its last price and store, and the line opens its history', persona: 'grocery-shopper', brief: 'grocery-price-history',
  steps: [
    'On Shopping, tick an item bought (give it a price) under a store; do the same for another item. Open Inventory.',
    'Find the ticked item. Under its name read the small underlined line, then tap it.',
    'In the sheet read the average, the store it is most often bought at and the list of months, then press Close.',
  ],
  expected: [
    'The line reads "Last: $X at Store, Mon" with the price you gave and this month; an item never bought has no line.',
    'The sheet lists this month with its price and store; with two or more priced months the lowest is tagged Cheapest.',
    'Close puts you back on Inventory with focus on the line you tapped.',
  ],
};

export default scenario;
